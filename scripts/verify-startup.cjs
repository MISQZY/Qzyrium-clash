const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, deps, runtime = process) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const exports = {}
  new Function('exports', 'require', 'process', code)(exports, name => name in deps ? deps[name] : require(name), runtime)
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

  const deletedTasks = [], login = [], warnings = []
  const legacyTask = '\\Qzyrium-clash-Startup-S-1-5-21-123-456-789-1000'
  const otherLegacyTask = '\\qzyrium-clash-startup-S-1-5-21-123-456-789-1001'
  let queryFails = false, deletionFails = false, registrationFails = false, queries = 0
  const deps = {
    electron: { app: { setLoginItemSettings: options => {
      if (registrationFails) throw new Error('registration failed')
      login.push(options.openAtLogin)
    } } },
    './logger': { logger: { info() {}, warn(message) { warnings.push(message) } } },
    'node:child_process': { execFile: (file, args, options, callback) => {
      assert.equal(require('node:path').basename(file), 'schtasks.exe', 'only native Task Scheduler is invoked')
      assert.equal(options.windowsHide, true)
      assert.ok(options.timeout > 0, 'cleanup cannot hang startup indefinitely')
      if (args.includes('/query')) {
        queries++
        const names = [legacyTask, otherLegacyTask, '\\OtherTask', '\\Qzyrium-clash-run',
          '\\Qzyrium-clash-Startup-backup', `${legacyTask}-backup`, `\\Folder${legacyTask}`]
        callback(queryFails ? new Error('query failed') : null, names.map(name => `"${name}","N/A","Готово"`).join('\r\n'), '')
      } else {
        assert.equal(args[0], '/delete')
        deletedTasks.push(args[args.indexOf('/tn') + 1])
        callback(deletionFails ? new Error('access denied') : null, '', '')
      }
    } }
  }
  const runtime = { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } }
  const { applyWindowsStartup, removeLegacyStartupTasks } = load('src/main/utils/windows-startup.ts', deps, runtime)
  for (const autoStartAsAdmin of [true, false]) {
    deletedTasks.length = 0
    await applyWindowsStartup({ autoStart: true, autoStartAsAdmin })
    assert.equal(login.at(-1), true, 'both legacy modes migrate to native login registration')
    assert.deepEqual(deletedTasks, [legacyTask, otherLegacyTask], 'only exact old root tasks are removed')
  }
  deletionFails = true
  await applyWindowsStartup({ autoStart: false, autoStartAsAdmin: true })
  assert.equal(login.at(-1), false, 'access denied during cleanup does not block disabling startup')
  assert.ok(warnings.some(message => message.includes('access denied')))
  deletionFails = false
  deletedTasks.length = 0
  await removeLegacyStartupTasks()
  assert.deepEqual(deletedTasks, [legacyTask, otherLegacyTask], 'cleanup retries after an elevated restart')
  queryFails = true
  await applyWindowsStartup({ autoStart: true })
  assert.equal(login.at(-1), true, 'query failure does not block login registration')
  registrationFails = true
  const previousQueries = queries
  await assert.rejects(() => applyWindowsStartup({ autoStart: false }), /registration failed/)
  assert.equal(queries, previousQueries, 'failed replacement leaves legacy startup intact')
  const unsupported = load('src/main/utils/windows-startup.ts', deps, { platform: 'linux', env: {} })
  await unsupported.applyWindowsStartup({ autoStart: true })
  await unsupported.removeLegacyStartupTasks()
  assert.equal(queries, previousQueries, 'Windows migration is skipped on other platforms')

  const { WindowService } = load('src/main/services/WindowService.ts', {
    electron: {}, child_process: {}, '../utils/paths': {}, '../utils/logger': {},
    '@shared/ipc': {}, '@shared/appearance': {}, '../utils/window-scale': {},
    '../utils/memory': { trimProcessMemory: async () => {} },
    '../utils/profile-import-queue': require('./fixtures/typescript.cjs').loadTypeScript('src/main/utils/profile-import-queue.ts')
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
  console.log('PASS: one-shot restart state, expiry, native startup migration, exact legacy task cleanup/retry/failures, renderer destruction and recreation')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
