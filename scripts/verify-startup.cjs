const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, deps) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const exports = {}
  new Function('exports', 'require', code)(exports, name => name in deps ? deps[name] : require(name))
  return exports
}

async function verify() {
  let stored, deleted = 0
  const state = load('src/main/utils/restart-state.ts', {
    electron: { app: { getPath: () => 'fixture' } },
    'node:fs': { readFileSync: () => stored, unlinkSync: () => { stored = undefined; deleted++ } },
    './atomicWrite': { writeFileAtomic: (_, data) => { stored = data } }
  })
  const running = { running: true, visible: true, elevated: true }
  state.saveRestartState(running)
  assert.deepEqual(state.readRestartState(), running, 'update/admin restart restores the active session and window')
  state.clearRestartState()
  assert.equal(state.readRestartState(), null, 'restart state is consumed once')
  stored = JSON.stringify({ ...running, createdAt: Date.now() - 11 * 60_000 })
  assert.equal(state.readRestartState(), null, 'old state must not start a VPN on a later normal launch')
  assert.ok(deleted > 0)

  const scripts = [], login = []
  let failDirect = false, cancel = false
  const { applyWindowsStartup } = load('src/main/utils/windows-startup.ts', {
    electron: { app: { setLoginItemSettings: options => login.push(options.openAtLogin) } },
    'node:child_process': { execFile: (_, args, options, callback) => {
      assert.equal(options.windowsHide, true)
      const script = Buffer.from(args.at(-1), 'base64').toString('utf16le')
      scripts.push(script)
      const elevated = script.includes('Start-Process')
      callback((elevated ? cancel : failDirect) ? new Error('denied') : null)
    } }
  })
  await applyWindowsStartup({ autoStart: true, autoStartAsAdmin: true })
  assert.match(scripts.at(-1), /-AtLogOn -User \$sid/)
  assert.match(scripts.at(-1), /-LogonType Interactive -RunLevel Highest/)
  assert.match(scripts.at(-1), /if \(!\$task -or/)
  assert.match(scripts.at(-1), /ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/)
  assert.equal(login.at(-1), false, 'scheduled startup disables the duplicate registry entry')
  await applyWindowsStartup({ autoStart: true, autoStartAsAdmin: false })
  assert.match(scripts.at(-1), /Unregister-ScheduledTask/)
  assert.equal(login.at(-1), true)
  await applyWindowsStartup({ autoStart: false, autoStartAsAdmin: true })
  assert.equal(login.at(-1), false)
  failDirect = true
  await applyWindowsStartup({ autoStart: true, autoStartAsAdmin: true })
  assert.match(scripts.at(-1), /-Verb RunAs.*-Wait -PassThru/)
  cancel = true
  const previous = login.length
  await assert.rejects(() => applyWindowsStartup({ autoStart: true, autoStartAsAdmin: true }), /denied/)
  assert.equal(login.length, previous, 'cancelled UAC leaves registry startup unchanged')

  const { WindowService } = load('src/main/services/WindowService.ts', {
    electron: {}, child_process: {}, '../utils/paths': {}, '../utils/logger': {},
    '@shared/ipc': {}, '@shared/appearance': {}, '../utils/window-scale': {}
  })
  const window = new WindowService({})
  let destroyed = 0, created = 0, changes = 0
  const visible = []
  window.mainWindow = { destroy: () => destroyed++ }
  window.setVisibilityHandler(value => visible.push(value))
  window.setModeChangedHandler(() => changes++)
  window.createWindow = async () => { created++; return {} }
  window.setCoreOnlyMode(true)
  assert.equal(destroyed, 1, 'core-only destroys the renderer instead of hiding it')
  assert.equal(window.getMainWindow(), null)
  assert.equal(window.isCoreOnlyMode(), true)
  assert.deepEqual(visible, [false], 'renderer streams are paused')
  window.setCoreOnlyMode(true)
  assert.equal(destroyed, 1)
  window.setCoreOnlyMode(false)
  assert.equal(created, 1)
  assert.equal(window.isCoreOnlyMode(), false)
  assert.equal(changes, 2, 'tray refreshes on entry and exit')
  window.setCoreOnlyMode(true)
  window.show()
  assert.equal(window.isCoreOnlyMode(), false, 'opening the app leaves core-only mode')
  console.log('PASS: one-shot restart state, expiry, scheduled startup modes/UAC cancellation, renderer destruction and recreation')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
