const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const { createIpcFixture } = require('./fixtures/ipc.cjs')
const channels = load('src/shared/ipc.ts', {}).IPC_CHANNELS
const logger = { info() {}, warn() {}, error() {}, debug() {} }
const flush = () => new Promise(resolve => setImmediate(resolve))

function load(file, dependencies = {}, runtime = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const requireModule = name => {
    if (name in dependencies) return dependencies[name]
    if (name.endsWith('/logger')) return { logger }
    if (name.startsWith('.') && name.endsWith('.json')) return require(path.resolve(path.dirname(file), name))
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts') : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    return target && fs.existsSync(target) ? load(target, dependencies, runtime) : require(name)
  }
  vm.runInThisContext(`(function(exports,require,process,fetch,console){${code}\n})`, { filename: file })(exports, requireModule, runtime.process ?? process, runtime.fetch ?? fetch, runtime.console ?? console)
  return exports
}
const fresh = () => structuredClone(load('src/shared/app-config.ts').DEFAULT_APP_CONFIG)

async function verifyPersistenceAndProfiles() {
  const root = path.resolve('artifacts/recovery-check')
  fs.mkdirSync(root, { recursive: true })
  const dir = fs.mkdtempSync(path.join(root, 'run-'))
  const paths = { settingsFilePath: path.join(dir, 'settings.json'), profilesFilePath: path.join(dir, 'profiles.json'), profilesDir: dir, mihomoDir: dir, coreBinaryPath: path.resolve('extra/sidecar/mihomo.exe') }
  let failRename = false
  const deps = {
    '../utils/paths': { getAppPaths: () => paths }, './paths': { getAppPaths: () => paths },
    'node:fs/promises': { ...fs.promises, rename: async (source, target) => {
      if (failRename && target === paths.settingsFilePath) throw Object.assign(new Error('disk unavailable'), { code: 'EIO' })
      return fs.promises.rename(source, target)
    } }
  }
  const { SettingService } = load('src/main/services/SettingService.ts', deps)
  const settings = new SettingService()
  await settings.initialize()
  failRename = true
  await assert.rejects(settings.updateSettings({ general: { autoConnect: true } }), /disk unavailable/)
  assert.equal(settings.getSettings().general.autoConnect, false)
  assert.equal(JSON.parse(fs.readFileSync(paths.settingsFilePath)).general.autoConnect, false)
  failRename = false
  await Promise.all([settings.updateSettings({ general: { theme: 'light' } }), settings.updateSettings({ kernel: { mode: 'direct' } })])
  assert.equal(settings.getSettings().general.theme, 'light')
  assert.equal(settings.getSettings().kernel.mode, 'direct')
  assert.equal(JSON.parse(fs.readFileSync(paths.settingsFilePath + '.bak')).general.theme, 'light')
  assert.ok(!fs.readdirSync(dir).some(file => file.endsWith('.tmp') || file.endsWith('.tmp.bak')))
  fs.writeFileSync(paths.settingsFilePath, '{broken')
  failRename = true
  const readOnlyRecovery = new SettingService()
  await readOnlyRecovery.initialize()
  assert.equal(readOnlyRecovery.getSettings().general.theme, 'light', 'a failed repair must still use the valid backup in memory')
  failRename = false
  const recovered = new SettingService()
  await recovered.initialize()
  assert.equal(recovered.getSettings().general.theme, 'light')
  assert.equal(JSON.parse(fs.readFileSync(paths.settingsFilePath)).general.theme, 'light')
  fs.unlinkSync(paths.settingsFilePath)
  const restoredMissing = new SettingService()
  await restoredMissing.initialize()
  assert.equal(restoredMissing.getSettings().general.theme, 'light', 'missing primary settings should recover from backup too')

  const { MihomoConfigFactory } = load('src/main/core/MihomoConfigFactory.ts', deps)
  for (const input of ['', 'proxies: [', '<html>Unavailable</html>', '{}', 'message: expired', '- not a config']) {
    assert.throws(() => MihomoConfigFactory.synthesize(input, fresh()))
  }
  assert.match(MihomoConfigFactory.synthesize(null, fresh()), /MATCH,DIRECT/)

  let response = 'rules:\n  - MATCH,DIRECT\n'
  const { ProfileService } = load('src/main/services/ProfileService.ts', { ...deps,
    axios: { get: async () => ({ data: response, headers: {} }) },
    'node:dns/promises': { lookup: async () => [{ address: '203.0.113.1', family: 4 }] }
  })
  const profiles = new ProfileService(settings)
  await profiles.initialize()
  const profile = await profiles.addProfile({ type: 'remote', url: 'https://fixture.invalid/sub', name: 'Working' })
  const original = await profiles.getProfileContent(profile.id)
  response = '<html>expired</html>'
  await assert.rejects(profiles.updateProfile(profile.id))
  assert.equal(await profiles.getProfileContent(profile.id), original)
  // The object is valid YAML, but Mihomo must reject its invalid schema before replacement.
  await assert.rejects(profiles.saveProfileContent(profile.id, 'proxies: 123\nrules: [MATCH,DIRECT]'))
  assert.equal(await profiles.getProfileContent(profile.id), original)
  const before = profiles.getProfiles().length
  await assert.rejects(profiles.addProfile({ type: 'remote', url: 'https://fixture.invalid/bad' }))
  assert.equal(profiles.getProfiles().length, before)
  response = 'rules:\n  - DOMAIN,example.com,DIRECT\n  - MATCH,DIRECT\n'
  await profiles.updateProfile(profile.id)
  assert.equal(fs.readFileSync(path.join(dir, profile.id + '.yaml.bak'), 'utf8'), original)
  await profiles.dispose()
  assert.ok(fs.existsSync(paths.profilesFilePath + '.bak'))
  fs.writeFileSync(paths.profilesFilePath, '{broken')
  const recoveredProfiles = new ProfileService(settings)
  await recoveredProfiles.initialize()
  assert.equal(recoveredProfiles.getProfiles()[0].id, profile.id)
  fs.unlinkSync(paths.profilesFilePath)
  const missingProfiles = new ProfileService(settings)
  await missingProfiles.initialize()
  assert.equal(missingProfiles.getProfiles()[0].id, profile.id)
}

async function verifyProxyLifecycle() {
  const config = fresh(), registry = []
  config.sysProxy.enable = true
  const { SysProxyService } = load('src/main/services/SysProxyService.ts', {
    child_process: { execFile(_file, args, _options, callback) { registry.push(args); callback(null, '', '') } }
  }, { process: { platform: 'win32' } })
  const settings = { getSettings: () => structuredClone(config), updateSettings: async patch => Object.assign(config, patch) }
  const proxy = new SysProxyService(settings)
  await proxy.initialize()
  assert.equal(proxy.getStatus().enabled, false, 'startup without a core must not enable the OS proxy')
  assert.equal(config.sysProxy.enable, true)
  await proxy.setCoreRunning(true)
  assert.equal(proxy.getStatus().enabled, true)
  await proxy.setCoreRunning(false)
  assert.equal(proxy.getStatus().enabled, false)
  assert.equal(config.sysProxy.enable, true, 'a stopped core must retain the user preference')
  await proxy.setCoreRunning(true)
  assert.equal(proxy.getStatus().enabled, true, 'restart must restore the proxy')
  await proxy.setSysProxy(false)
  await proxy.setCoreRunning(false)
  await proxy.setCoreRunning(true)
  assert.equal(proxy.getStatus().enabled, false, 'explicit user disable must survive restart')
  await proxy.setSysProxy(true)
  await proxy.dispose()
  assert.equal(proxy.getStatus().enabled, false)
  assert.equal(config.sysProxy.enable, true, 'shutdown must preserve preference')
  assert.ok(registry.length > 0)

  let broadcast
  const empty = class {}
  const { ServiceManager } = load('src/main/services/ServiceManager.ts', {
    './SettingService': { SettingService: class { constructor() { return settings } } },
    './ProfileService': { ProfileService: empty },
    './SysProxyService': { SysProxyService: class { constructor() { return proxy } } },
    './KernelService': { KernelService: class { setBroadcaster(fn) { broadcast = fn } } },
    './WindowService': { WindowService: class { broadcast() {} setVisibilityHandler() {} setModeChangedHandler() {} } },
    './TrayService': { TrayService: class { clearProxies() {} updateContextMenu() {} async refreshProxies() {} } },
    './DesktopService': { DesktopService: empty }, './ThemeStore': { ThemeStore: empty }, './UpdateService': { UpdateService: empty },
    '../utils/paths': { getAppPaths: () => ({ userData: 'unused' }) }
  })
  new ServiceManager()
  broadcast('event:core-status', 'running')
  await proxy.waitForUpdates()
  assert.equal(proxy.getStatus().enabled, true)
  broadcast('event:core-status', 'stopped')
  await proxy.waitForUpdates()
  broadcast('event:core-status', 'running')
  await proxy.waitForUpdates()
  assert.equal(proxy.getStatus().enabled, true)
  await proxy.dispose()
}

async function verifyProfileRepository() {
  const { ProfileRepository } = load('src/main/services/ProfileRepository.ts')
  const directory = fs.mkdtempSync(path.resolve('artifacts/profile-repository-'))
  const metadata = path.join(directory, 'profiles.json')
  const repository = new ProfileRepository({ profilesDir: directory, profilesFilePath: metadata })
  const first = { id: 'one', name: 'First', type: 'local', updatedAt: 1 }
  const second = { id: 'two', name: 'Second', type: 'local', updatedAt: 2 }
  const selection = { async apply() {}, async rollback() {} }
  await repository.initialize()
  await repository.add(first, 'original', selection)
  await repository.add(second, 'second', selection)
  const baseline = repository.list()
  repository.list()[0].name = 'external mutation'
  assert.deepEqual(repository.list(), baseline, 'readers cannot mutate repository state')
  const write = repository.write.bind(repository)
  let failNextWrite = false
  repository.write = async (...args) => {
    if (failNextWrite) { failNextWrite = false; throw new Error('metadata write failed') }
    return write(...args)
  }
  failNextWrite = true
  await assert.rejects(repository.saveContent('one', 'unsaved content', async () => {}), /metadata write failed/)
  assert.equal(await repository.content('one'), 'original', 'metadata failure restores the previous YAML')
  failNextWrite = true
  await assert.rejects(repository.add({ ...first, id: 'three' }, 'orphan', selection), /metadata write failed/)
  assert.equal(await repository.content('three'), null, 'failed add removes the new orphan file')
  assert.deepEqual(repository.list(), baseline)
  let rolledBack = 0
  const rejectedSelection = { async apply() { throw new Error('settings write failed') }, async rollback() { rolledBack++ } }
  await assert.rejects(repository.add({ ...first, id: 'four' }, 'orphan', rejectedSelection), /settings write failed/)
  assert.equal(await repository.content('four'), null)
  await assert.rejects(repository.remove('one', rejectedSelection), /settings write failed/)
  assert.equal(rolledBack, 2, 'failed active-profile changes are rolled back for add and delete')
  assert.equal(await repository.content('one'), 'original')
  const unlink = fs.promises.unlink
  fs.promises.unlink = async file => {
    if (file === path.join(directory, 'one.yaml')) throw new Error('file is locked')
    return unlink(file)
  }
  try { await assert.rejects(repository.remove('one', selection), /file is locked/) }
  finally { fs.promises.unlink = unlink }
  assert.deepEqual(JSON.parse(fs.readFileSync(metadata, 'utf8')), baseline, 'failed deletion restores disk metadata')
  assert.deepEqual(repository.list(), baseline, 'failed deletion preserves memory')
  await Promise.all([repository.update('one', item => { item.name = 'Renamed' }), repository.remove('two', selection)])
  await repository.flush()
  assert.equal(repository.list().length, 1, 'queued mutations recover after rejected operations')
  assert.equal(repository.get('one').name, 'Renamed')
}

async function verifyElevationRecovery() {
  // Exercise the actual launcher without opening UAC or starting another process.
  for (const outcome of ['success', 'cancel', 'throw']) {
    const calls = []
    const app = {
      isPackaged: false, getAppPath: () => "C:\\VPN test's\\app",
      releaseSingleInstanceLock: () => calls.push('release'),
      requestSingleInstanceLock: () => calls.push('restore'),
      exit: () => calls.push('exit')
    }
    const { restartAsAdmin, isProcessElevated } = load('src/main/utils/elevation.ts', {
      electron: { app },
      './elevate-task': { checkElevateTask: () => false, tryRunElevateTask: () => false },
      child_process: {
        execFileSync: (file) => {
          assert.ok(file.includes('fltmc') || file.includes('whoami'))
        },
        execFile: (file, args, options, callback) => {
          assert.equal(file, 'wscript.exe')
          assert.equal(options.windowsHide, true)
          const vbsFile = args[1]
          const script = fs.readFileSync(vbsFile, 'utf8')
          assert.match(script, /Shell\.Application/)
          assert.match(script, /runas/)
          assert.ok(script.includes("C:\\VPN test's\\app") || script.includes("C:\\VPN test''s\\app"))
          assert.ok(script.includes('--admin-restart=123'))
          assert.ok(!script.includes('--admin-restart=999'))
          if (outcome === 'throw') throw new Error('spawn failed')
          callback(outcome === 'cancel' ? new Error('UAC cancelled') : null)
        }
      }
    }, { process: { platform: 'win32', execPath: 'C:\\Electron\\electron.exe', pid: 123, argv: ['electron', '.', '--admin-restart=999'] } })
    assert.equal(isProcessElevated(), true)
    assert.equal(await restartAsAdmin(), outcome === 'success')
    assert.deepEqual(calls, ['release', outcome === 'success' ? 'exit' : 'restore'])
  }
  for (const running of [false, true]) {
    const ipc = createIpcFixture()
    const handlers = new Map(), calls = []
    let state = running ? 'running' : 'stopped'
    const { registerIpcHandlers } = load('src/main/ipc/registerHandlers.ts', {
      electron: { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } },

      '../utils/elevation': { restartAsAdmin: async () => false },
      '../utils/restart-state': { saveRestartState: state => { assert.equal(state.running, running); assert.equal(state.visible, true) }, clearRestartState() {} }
    })
    registerIpcHandlers({
      windowService: ipc.windowService,
      sysProxyService: { setCoreRunning: async value => calls.push('proxy:' + value) },
      kernelService: { getStatus: () => state, stop: async () => { state = 'stopped' }, start: async () => { state = 'running'; calls.push('start') } },
      desktopService: { dispose: async () => calls.push('dispose'), initialize: async () => calls.push('resume') }
    })
    assert.equal(await handlers.get(channels.APP_RESTART_AS_ADMIN)(ipc.event), false)
    assert.ok(calls.includes('resume'))
    assert.equal(calls.includes('start'), running)
    assert.equal(state, running ? 'running' : 'stopped')
  }
}

async function verifyServiceLifecycle() {
  const { ServiceManager } = load('src/main/services/ServiceManager.ts')
  const calls = []
  const service = (name, fail = false) => ({
    async initialize() { calls.push(`start:${name}`); if (fail) throw new Error(name) },
    async dispose() { calls.push(`stop:${name}`) }
  })
  const settings = service('settings'), profiles = service('profiles', true), after = service('after')
  const failed = new ServiceManager(() => ({ settingService: settings, profileService: profiles, services: [settings, profiles, after] }))
  await assert.rejects(failed.initialize(), /Required service failed/)
  assert.deepEqual(calls, ['start:settings', 'start:profiles', 'stop:profiles', 'stop:settings'])
  await failed.dispose()
  assert.equal(calls.length, 4, 'cleanup is idempotent and never disposes unstarted services')
  calls.length = 0
  const optional = service('optional', true), last = service('last')
  const partial = new ServiceManager(() => ({ settingService: settings, services: [settings, optional, last] }))
  await partial.initialize()
  await partial.dispose()
  assert.deepEqual(calls, ['start:settings', 'start:optional', 'stop:optional', 'start:last', 'stop:last', 'stop:settings'])
}

function verifyStreams() {
  class Socket extends EventEmitter {
    static all = []
    constructor(url) { super(); this.url = url; Socket.all.push(this) }
    terminate() { this.terminated = true }
  }
  const { MihomoApiClient } = load('src/main/core/MihomoApiClient.ts', { ws: Socket })
  const secret = 'a&b#c+d?%test'
  const api = new MihomoApiClient('127.0.0.1', 9095, secret)
  for (const stream of ['Traffic', 'Log']) {
    const start = stream === 'Traffic' ? 'startTrafficStream' : 'startLogStream'
    const stop = stream === 'Traffic' ? 'stopTrafficStream' : 'stopLogStream'
    api[start]()
    const old = Socket.all.at(-1)
    assert.equal(new URL(old.url).searchParams.get('token'), secret)
    api[stop]()
    api[start]()
    const replacement = Socket.all.at(-1), count = Socket.all.length
    old.emit('close')
    api[start]()
    assert.equal(Socket.all.length, count, 'a stale close must not orphan the replacement socket')
    api[stop]()
    assert.equal(replacement.terminated, true)
    replacement.emit('close')
  }
}

async function verifyResourceFailure() {
  for (const platform of ['unsupported', 'win32']) {
    const runtime = { platform, arch: 'x64', cwd: () => process.cwd(), pid: process.pid, exitCode: 0 }
    const errors = []
    load('scripts/prepare-resources.mjs', { fs: { mkdirSync() {}, existsSync: () => false }, 'adm-zip': class {} }, {
      process: runtime, fetch: async () => { throw new Error('network unavailable') },
      console: { log() {}, error: (...args) => errors.push(args) }
    })
    await flush()
    assert.equal(runtime.exitCode, 1, 'fatal resource preparation failures must fail the command')
    assert.equal(errors.length, 1)
  }
}

Promise.resolve().then(verifyPersistenceAndProfiles).then(verifyProfileRepository).then(verifyProxyLifecycle).then(verifyElevationRecovery).then(verifyServiceLifecycle).then(verifyStreams).then(verifyResourceFailure)
  .then(() => console.log('PASS: atomic persistence/recovery, rejected subscriptions with real Mihomo, proxy startup/restarts, cancelled elevation, stale WebSockets, encoded tokens and failed resource preparation'))
  .catch(error => { console.error(error); process.exitCode = 1 })
