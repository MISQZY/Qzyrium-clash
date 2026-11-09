const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

function load(file, dependencies, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const exports = {}
  const evaluate = vm.runInThisContext(`(function(exports, require, setTimeout, clearTimeout, process, Date) {\n${output}\n})`, { filename: file })
  evaluate(exports, (name) => {
    if (dependencies[name]) return dependencies[name]
    if (name.endsWith('.json') && name.startsWith('.')) return require(path.resolve(path.dirname(file), name))
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts') : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    return target && fs.existsSync(target) ? load(target, {}) : require(name)
  }, overrides.setTimeout ?? setTimeout, overrides.clearTimeout ?? clearTimeout, process, overrides.Date ?? Date)
  return exports
}
const logger = { info() {}, warn() {}, error() {}, debug() {} }

async function verifyRestart() {
  const children = [], timers = [], probes = []
  let now = 0
  const flush = () => new Promise(resolve => setImmediate(resolve))
  const { MihomoProcessManager } = load('src/main/core/MihomoProcessManager.ts', {
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
  const start = () => manager.start('fixture', 'fixture.yaml', 9999, 'test-secret')
  const firstStart = start()
  await flush()
  assert.equal(manager.getState(), 'starting', 'spawn alone does not mean API is ready')
  assert.equal(probes[0].url, 'http://127.0.0.1:9999/version')
  assert.equal(probes[0].options.headers.Authorization, 'Bearer test-secret')
  assert.equal(probes[0].options.proxy, false)
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
  await timeoutAssertion
  assert.equal(manager.getState(), 'error', 'readiness has a bounded deadline')
  const timeoutStop = manager.stop()
  timers.filter(timer => timer.delay === 5000 && !timer.cancelled).at(-1).callback()
  await assert.rejects(timeoutStop, /Timed out/)
  children.at(-1).emit('error', new Error('still alive'))
  await assert.rejects(start(), /previous Mihomo process/)
  assert.equal(children.length, 4, 'failed stop must not orphan a still-running child')
}

async function verifyModeUpdates() {
  const handlers = new Map(), calls = []
  const { registerIpcHandlers } = load('src/main/ipc/registerHandlers.ts', {
    electron: { ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) } },
    '@shared/ipc': { IPC_CHANNELS: new Proxy({}, { get: (_, key) => key }) }, '../utils/logger': { logger }
  })
  const initial = structuredClone(load('src/shared/app-config.ts', {}).DEFAULT_APP_CONFIG)
  initial.sysProxy.enable = true
  let settings, status, rejectMode
  const reset = (state = 'running') => { calls.length = 0; settings = structuredClone(initial); status = state; rejectMode = false }
  const services = {
    settingService: { getSettings: () => settings, updateSettings: async patch => { calls.push('save'); settings = { ...settings, ...patch, kernel: { ...settings.kernel, ...patch.kernel } }; return settings } },
    kernelService: { getStatus: () => status, patchConfigs: async patch => { calls.push(`mode:${patch.mode}`); if (rejectMode) throw new Error('API unavailable') }, restart: async () => { calls.push('restart') } },
    sysProxyService: { setSysProxy: async () => { calls.push('system-proxy') } },
    trayService: { updateContextMenu() {} }, windowService: { updateTheme() {} }
  }
  registerIpcHandlers(services)
  const update = () => handlers.get('APP_UPDATE_SETTINGS')
  reset()
  await update()(null, { kernel: { ...settings.kernel, mode: 'global' } })
  assert.deepEqual(calls, ['mode:global', 'save'], 'live mode change must not restart or touch OS proxy')
  assert.equal(settings.kernel.mode, 'global')
  calls.length = 0
  await update()(null, { kernel: { ...settings.kernel, mode: 'rule' } })
  assert.deepEqual(calls, ['mode:rule', 'save'])
  reset('stopped')
  await update()(null, { kernel: { ...settings.kernel, mode: 'global' } })
  assert.deepEqual(calls, ['save'], 'changing a stopped core mode must not start it')
  reset()
  rejectMode = true
  await assert.rejects(update()(null, { kernel: { ...settings.kernel, mode: 'global' } }), /API unavailable/)
  assert.equal(settings.kernel.mode, 'rule', 'API failure must preserve saved mode')
  reset()
  await update()(null, { kernel: { ...settings.kernel, mixedPort: 7896 } })
  assert.deepEqual(calls, ['save', 'restart', 'system-proxy'], 'port change still restarts and reapplies OS proxy')
  reset()
  await update()(null, { kernel: structuredClone(settings.kernel) })
  assert.deepEqual(calls, ['save'], 'unchanged settings must not restart')
}

Promise.resolve().then(verifyRestart).then(verifyModeUpdates).then(() => console.log('PASS: process exit ordering, stale probes, API readiness retries/deadline, stop failures, live Rules/Global and port updates')).catch(error => { console.error(error); process.exitCode = 1 })
