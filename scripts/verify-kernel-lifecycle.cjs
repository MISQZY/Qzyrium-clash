const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const { createIpcFixture } = require('./fixtures/ipc.cjs')
const channels = load('src/shared/ipc.ts', {}).IPC_CHANNELS

function load(file, dependencies, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const exports = {}
  const evaluate = vm.runInThisContext(`(function(exports, require, setTimeout, clearTimeout, process, Date) {\n${output}\n})`, { filename: file })
  evaluate(exports, (name) => {
    if (dependencies[name]) return dependencies[name]
    if (name.endsWith('.json') && name.startsWith('.')) return require(path.resolve(path.dirname(file), name))
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts') : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    return target && fs.existsSync(target) ? load(target, {}) : require(name)
  }, overrides.setTimeout ?? setTimeout, overrides.clearTimeout ?? clearTimeout, overrides.process ?? process, overrides.Date ?? Date)
  return exports
}
const recordedLogs = []
const logger = { info() {}, warn() {}, error() {}, debug() {}, writeEntry(entry) { recordedLogs.push(entry) } }

async function verifyLinuxLaunch() {
  let launch
  const child = Object.assign(new EventEmitter(), { pid: 123, stdout: new EventEmitter(), stderr: new EventEmitter() })
  const runtime = { platform: 'linux', execPath: '/usr/bin/electron', env: { FIXTURE: '1' } }
  const paths = { coreBinaryPath: '/fixture/mihomo', geoFilesDir: '/fixture/files' }
  const { MihomoProcessManager } = load('src/main/core/MihomoProcessManager.ts', {
    fs: { existsSync: () => true, readFileSync: () => 'tun: {enable: true, device: Qzyrium, auto-route: true}' },
    child_process: { spawn: (...args) => { launch = args; return child }, execFile() {} },
    '../utils/paths': { getAppPaths: () => paths }, '../utils/logger': { logger },
    '../utils/network-watchdog': { networkWatchdog: { async trackCore() {} } }
  }, { process: runtime })
  const manager = new MihomoProcessManager()
  manager.waitForReady = async () => { manager.setState('running') }
  await manager.start('/work', '/work/config.yaml', 9095, 'fixture-secret')
  assert.equal(launch[0], runtime.execPath, 'Linux launches its Node supervisor through the Electron executable')
  assert.equal(path.basename(launch[1][0]), 'linux-core-supervisor.cjs')
  assert.equal(launch[1][1], paths.coreBinaryPath)
  assert.equal(JSON.parse(launch[1][2]).device, 'Qzyrium')
  assert.deepEqual(launch[1].slice(3), ['-d', '/work', '-f', '/work/config.yaml', '-ext-ctl', '127.0.0.1:9095'])
  assert.equal(launch[2].env.ELECTRON_RUN_AS_NODE, '1', 'supervision must not launch a second Electron interface')
  assert.equal(launch[2].env.FIXTURE, '1')
  assert.equal(launch[2].stdio[0], 'pipe', 'supervisor must observe parent death through pipe EOF')

  const { MihomoConfigFactory } = load('src/main/core/MihomoConfigFactory.ts', {}, { process: runtime })
  const config = structuredClone(load('src/shared/app-config.ts', {}).DEFAULT_APP_CONFIG)
  config.kernel.tun.enable = true
  const output = require('yaml').parse(MihomoConfigFactory.synthesize(null, config))
  assert.equal(output.tun.device, 'Qzyrium', 'Linux TUN recovery has an explicit interface identity')
}

async function verifyRestart() {
  const children = [], timers = [], probes = []
  let now = 0
  const flush = () => new Promise(resolve => setImmediate(resolve))
  const { MihomoProcessManager } = load('src/main/core/MihomoProcessManager.ts', {
    '../utils/network-watchdog': { networkWatchdog: { async trackCore() {} } },
    child_process: {
      spawn: () => {
        const child = new EventEmitter()
        Object.assign(child, { pid: 100 + children.length, stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => true })
        children.push(child)
        return child
      }, execFile(_file, _args, _options, callback) { callback(null, '', '') }
    },
    axios: { get: (url, options) => new Promise((resolve, reject) => { probes.push({ url, options, resolve, reject }) }) },
    fs: { existsSync: () => true }, '../utils/paths': { getAppPaths: () => ({ coreBinaryPath: 'fixture-mihomo' }) }, '../utils/logger': { logger }
  }, { setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer }, clearTimeout: (timer) => { timer.cancelled = true }, Date: class extends Date { static now() { return now } } })
  const manager = new MihomoProcessManager()
  const journal = [], tunErrors = []
  manager.on('log', entry => journal.push(entry))
  manager.on('tun-error', message => tunErrors.push(message))
  const start = () => manager.start('fixture', 'fixture.yaml', 9999, 'test-secret')
  const firstStart = start()
  await flush()
  assert.equal(manager.getState(), 'starting', 'spawn alone does not mean API is ready')
  assert.equal(probes[0].url, 'http://127.0.0.1:9999/version')
  assert.equal(probes[0].options.headers.Authorization, 'Bearer test-secret')
  assert.equal(probes[0].options.proxy, false)
  children[0].stdout.emit('data', Buffer.from('level=info msg="first"\nlevel=warning msg="par'))
  assert.equal(journal.length, 1, 'partial lines wait for the rest of the pipe data')
  children[0].stdout.emit('data', Buffer.from('tial"\n'))
  children[0].stderr.emit('data', Buffer.from('level=error msg="Start TUN listening error"\nlast line'))
  children[0].stderr.emit('end')
  assert.deepEqual(journal.map(entry => entry.payload), ['first', 'partial', 'Start TUN listening error', 'last line'])
  assert.deepEqual(journal.map(entry => entry.type), ['info', 'warning', 'error', 'warning'])
  assert.equal(tunErrors.length, 1, 'TUN errors on stderr must trigger recovery')
  assert.deepEqual(recordedLogs, journal, 'disk and journal receive the same entries exactly once')
  const restarting = manager.restart('fixture', 'fixture.yaml', 9999, '')
  assert.equal(children.length, 1, 'replacement must wait for old process exit')
  children[0].emit('exit', 1, null)
  await flush()
  assert.equal(children.length, 2)
  assert.equal(manager.getState(), 'starting')
  children[0].emit('exit', 1, null)
  children[0].emit('error', new Error('stale process error'))
  assert.equal(manager.getState(), 'starting', 'old child events cannot change replacement state')
  probes[0].resolve({ data: { version: 'old' } })
  await firstStart
  assert.equal(manager.getState(), 'starting', 'old readiness response cannot promote replacement')
  probes[1].resolve({ data: { version: 'new' } })
  await restarting
  assert.equal(manager.getState(), 'running')
  const stopped = manager.stop()
  children[1].emit('exit', 1, null)
  await stopped
  assert.equal(manager.getState(), 'stopped')
  const delayedStart = start()
  await flush()
  probes[2].reject(new Error('connection refused'))
  await flush()
  assert.equal(manager.getState(), 'starting')
  timers.filter(timer => timer.delay === 200).at(-1).callback()
  await flush()
  probes[3].resolve({ data: { version: 'ready after retry' } })
  await delayedStart
  assert.equal(manager.getState(), 'running', 'API readiness is retried')
  const delayedStop = manager.stop()
  children[2].emit('exit', 1, null)
  await delayedStop
  const timeoutStart = start()
  const timeoutAssertion = assert.rejects(timeoutStart, /did not become ready/)
  await flush()
  probes[4].reject(new Error('offline'))
  await flush()
  now = 15001
  timers.filter(timer => timer.delay === 200).at(-1).callback()
  await flush()
  children.at(-1).emit('exit', 1, null)
  await timeoutAssertion
  assert.equal(manager.getState(), 'error', 'readiness has a bounded deadline')
  const recoveredStart = start()
  await flush()
  probes.at(-1).resolve({ data: { version: 'recovered' } })
  await recoveredStart
  assert.equal(manager.getState(), 'running', 'a failed startup cleans up its process and allows retry')
  const timeoutStop = manager.stop()
  timers.filter(timer => timer.delay === 5000 && !timer.cancelled).at(-1).callback()
  await assert.rejects(timeoutStop, /Timed out/)
  children.at(-1).emit('error', new Error('still alive'))
  await assert.rejects(start(), /previous Mihomo process/)
  assert.equal(children.length, 5, 'failed stop must not orphan a still-running child')
}

async function verifyModeUpdates() {
  const ipc = createIpcFixture()
  const handlers = new Map(), calls = []
  const { registerIpcHandlers } = load('src/main/ipc/registerHandlers.ts', {
    '../utils/elevation': { isProcessElevated: () => false, restartAsAdmin: async () => false },
    electron: { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } },

    '../utils/logger': { logger }
  })
  const initial = structuredClone(load('src/shared/app-config.ts', {}).DEFAULT_APP_CONFIG)
  initial.sysProxy.enable = true
  let settings, status, rejectMode, rejectSave
  const reset = (state = 'running') => { calls.length = 0; settings = structuredClone(initial); status = state; rejectMode = false; rejectSave = false }
  const services = {
    settingService: { getSettings: () => settings, updateSettings: async patch => { calls.push('save'); if (rejectSave) throw new Error('disk full'); settings = { ...settings, ...patch, kernel: { ...settings.kernel, ...patch.kernel } }; return settings } },
    kernelService: { getStatus: () => status, patchConfigs: async patch => { calls.push(`mode:${patch.mode}`); if (rejectMode) throw new Error('API unavailable') }, restart: async () => { calls.push('restart') } },
    sysProxyService: { setSysProxy: async () => { calls.push('system-proxy') } },
    trayService: { updateContextMenu() {} }, windowService: { ...ipc.windowService, updateTheme() {} }
  }
  const { NetworkModeController } = load('src/main/services/NetworkModeController.ts', { '../utils/logger': { logger } })
  services.networkModeController = new NetworkModeController(services.settingService, services.kernelService, services.sysProxyService)
  registerIpcHandlers(services)
  const update = () => handlers.get(channels.APP_UPDATE_SETTINGS)
  reset()
  await update()(ipc.event, { kernel: { ...settings.kernel, mode: 'global' } })
  assert.deepEqual(calls, ['mode:global', 'save'], 'live mode change must not restart or touch OS proxy')
  assert.equal(settings.kernel.mode, 'global')
  calls.length = 0
  await update()(ipc.event, { kernel: { ...settings.kernel, mode: 'rule' } })
  assert.deepEqual(calls, ['mode:rule', 'save'])
  reset('stopped')
  await update()(ipc.event, { kernel: { ...settings.kernel, mode: 'global' } })
  assert.deepEqual(calls, ['save'], 'changing a stopped core mode must not start it')
  reset()
  rejectMode = true
  await assert.rejects(update()(ipc.event, { kernel: { ...settings.kernel, mode: 'global' } }), /API unavailable/)
  assert.equal(settings.kernel.mode, 'rule', 'API failure must preserve saved mode')
  reset()
  rejectSave = true
  await assert.rejects(update()(ipc.event, { kernel: { ...settings.kernel, mode: 'global' } }), /disk full/)
  assert.deepEqual(calls, ['mode:global', 'save', 'mode:rule'], 'failed persistence rolls the live core back to the saved routing mode')
  assert.equal(settings.kernel.mode, 'rule')
  reset()
  await update()(ipc.event, { kernel: { ...settings.kernel, mixedPort: 7896 } })
  assert.deepEqual(calls, ['save', 'restart', 'system-proxy'], 'port change still restarts and reapplies OS proxy')
  reset()
  await update()(ipc.event, { kernel: structuredClone(settings.kernel) })
  assert.deepEqual(calls, ['save'], 'unchanged settings must not restart')
  reset()
  services.sysProxyService.getStatus = () => ({ enabled: settings.sysProxy.enable })
  services.sysProxyService.setSysProxy = async enable => { calls.push(`proxy:${enable}`); settings.sysProxy.enable = enable }
  const commands = new NetworkModeController(services.settingService, services.kernelService, services.sysProxyService, async () => {}, () => {}, () => true)
  await commands.setTunEnabled(true)
  assert.equal(settings.kernel.tun.enable, true)
  assert.equal(settings.sysProxy.enable, false)
  await commands.setSystemProxy(true)
  assert.equal(settings.kernel.tun.enable, false, 'all proxy commands disable conflicting TUN mode')
  assert.equal(settings.sysProxy.enable, true)
  reset()
  rejectSave = true
  await assert.rejects(commands.setTunEnabled(true), /disk full/)
  assert.equal(settings.kernel.tun.enable, false, 'failed transition preserves saved TUN mode')
  assert.equal(settings.sysProxy.enable, true, 'failed transition restores system proxy')
  reset()
  await Promise.all([commands.setTunEnabled(true), commands.setSystemProxy(true)])
  assert.equal(settings.kernel.tun.enable, false, 'concurrent commands execute in order')
  assert.equal(settings.sysProxy.enable, true)
}

async function verifyWakeRecovery() {
  const config = load('src/shared/app-config.ts', {}).DEFAULT_APP_CONFIG
  config.general.reconnectAfterSleep = true
  const power = new EventEmitter(), manager = new EventEmitter(), api = new EventEmitter(), timers = new Set()
  let state = 'stopped', starts = 0, healthy = true
  manager.getState = () => state
  Object.assign(api, { startTrafficStream() {}, stopAllStreams() {}, getVersion: async () => { if (!healthy) throw new Error('offline'); return { version: 'test' } } })
  const { KernelService } = load('src/main/services/KernelService.ts', {
    electron: { powerMonitor: power }, '../utils/logger': { logger }
  }, { setTimeout: (fn, ms) => { const timer = { fn, ms, unref() {} }; timers.add(timer); return timer }, clearTimeout: timer => timers.delete(timer) })
  const kernel = new KernelService({ getSettings: () => config }, {}, {
    processManager: manager, apiClient: api, geoIp: { dispose() {} }, configBuilder: {}, trafficAccounting: {}
  })
  kernel.startCore = async () => { starts++; state = 'running'; manager.emit('state-change', state) }
  kernel.stopCore = async () => { state = 'stopped'; manager.emit('state-change', state) }
  await kernel.initialize()
  assert.equal(power.listenerCount('resume'), 1)
  await kernel.start()
  const wake = async () => {
    power.emit('suspend'); power.emit('resume')
    const timer = [...timers][0]
    assert.equal(timer.ms, 5000)
    timers.delete(timer); timer.fn()
    await kernel.lifecycle
  }
  await wake()
  assert.equal(starts, 1, 'healthy core survives wake-up without a restart')
  healthy = false
  await wake()
  assert.equal(starts, 2, 'unresponsive core restarts after wake-up')
  power.emit('suspend'); power.emit('resume')
  const stale = [...timers][0]
  await kernel.stop()
  stale.fn(); await kernel.lifecycle
  assert.equal(starts, 2, 'manual stop cancels pending resume recovery')
  power.emit('suspend'); power.emit('resume')
  assert.equal(timers.size, 0, 'disconnected sessions stay disconnected')
  config.general.autoRestartCore = true
  config.general.coreRestartMaxAttempts = 2
  kernel.startCore = async () => { starts++; state = 'error'; manager.emit('state-change', state); throw new Error('crashed') }
  await assert.rejects(kernel.start(), /crashed/)
  for (let i = 0; i < 2; i++) {
    const timer = [...timers][0]
    assert.ok(timer, 'failed core schedules a retry')
    timers.delete(timer); timer.fn()
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.equal(starts, 5, 'automatic retries stop at the configured limit')
  assert.equal(timers.size, 0, 'repeated failures do not form an infinite retry loop')
  await assert.rejects(kernel.start(), /crashed/)
  assert.equal(timers.size, 1, 'manual start resets the retry allowance')
  const cancelledRetry = [...timers][0]
  await kernel.stop()
  cancelledRetry.fn()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(starts, 6, 'manual stop cancels a scheduled crash restart')
  assert.equal(timers.size, 0)
  await kernel.dispose()
  assert.equal(power.listenerCount('resume'), 0, 'power listeners are removed on shutdown')
}

Promise.resolve().then(verifyRestart).then(verifyLinuxLaunch).then(verifyModeUpdates).then(verifyWakeRecovery).then(() => console.log('PASS: process lifecycle, Linux supervision, API readiness, network modes and cancellable wake recovery')).catch(error => { console.error(error); process.exitCode = 1 })
