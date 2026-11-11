const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const flush = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}

// A deterministic hook host exercises the actual store with controlled IPC promises.
// It keeps React's dependency and cleanup semantics without starting Electron/Mihomo.
const slots = [], effects = [], timers = new Set(), listeners = new Map(), events = {}
let cursor = 0, view, scheduled = false, renders = 0
function schedule() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => { scheduled = false; render() })
}
const react = {
  useState(initial) {
    const i = cursor++
    slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [slots[i].value, value => {
      const next = typeof value === 'function' ? value(slots[i].value) : value
      if (!Object.is(next, slots[i].value)) { slots[i].value = next; schedule() }
    }]
  },
  useRef(value) { const i = cursor++; slots[i] ??= { current: value }; return slots[i] },
  useCallback(fn, deps) {
    const i = cursor++
    if (!slots[i] || deps.some((d, n) => !Object.is(d, slots[i].deps[n]))) slots[i] = { fn, deps }
    return slots[i].fn
  },
  useEffect(fn, deps) {
    const i = cursor++
    if (!slots[i] || deps.some((d, n) => !Object.is(d, slots[i].deps[n]))) {
      const previous = slots[i]
      slots[i] = { deps, cleanup: previous?.cleanup }
      effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn() })
    }
  },
  useMemo(fn, deps) {
    const i = cursor++
    if (!slots[i] || deps.some((d, n) => !Object.is(d, slots[i].deps[n]))) {
      slots[i] = { value: fn(), deps }
    }
    return slots[i].value
  },
  createContext(defaultValue) {
    const ctx = { _currentValue: defaultValue }
    ctx.Provider = ({ value, children }) => { ctx._currentValue = value; return children }
    return ctx
  },
  useContext(ctx) { return ctx?._currentValue },
  createElement(type, props, ...children) { return { type, props: { ...props, children } } }
}
const config = { general: { language: 'en' }, kernel: { mode: 'rule' } }
let connectionsCalls = 0, proxyCalls = 0, baseCalls = 0
const ruleScopes = []
let backendState = 'running'
let backendSessionStartedAt = 12345
const connections = deferred(), rules = deferred(), systemProxy = deferred()
const api = {
  kernel: {
    getStatus: async () => { baseCalls++; return backendState },
    getSessionStartedAt: async () => backendState === 'running' ? backendSessionStartedAt : null,
    stop: async () => { backendState = 'stopped'; events.status(backendState) },
    start: async () => { events.status('starting'); backendSessionStartedAt = 20000; backendState = 'running'; events.status(backendState) }
  },
  sysproxy: { getStatus: () => systemProxy.promise },
  profiles: { getList: async () => [], getActive: async () => null },
  settings: { get: async () => config },
  mihomo: {
    getProxies: async () => { proxyCalls++; if (proxyCalls === 1) throw Error('transient'); return { PROXY: { name: 'ready' } } },
    getRules: scope => { ruleScopes.push(scope); return rules.promise },
    getConnections: () => { connectionsCalls++; return connections.promise }
  },
  events: {
    onTraffic: fn => { events.traffic = fn; return () => {} },
    onCoreStatus: fn => { events.status = fn; return () => {} },
    onLog: fn => { events.log = fn; return () => {} }
  }
}
const document = {
  visibilityState: 'visible',
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: name => listeners.delete(name)
}
function timer(fn, ms) { const item = { fn, ms }; timers.add(item); return item }
const file = path.resolve(__dirname, '../src/renderer/src/stores/useAppStore.ts')
const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
function createResolver(fromDir) {
  return function customRequire(name) {
    if (name === 'react') return react
    if (name === '@shared/app-config') return { DEFAULT_APP_CONFIG: config }
    if (name === '../i18n/catalogs' || name.endsWith('i18n/catalogs')) return { translate: () => '' }
    if (name === '@shared/custom-localization') return { selectedLocalization: () => undefined }
    if (name.startsWith('.')) {
      let resolved = path.resolve(fromDir, name)
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        resolved = path.join(resolved, 'index.ts')
      } else if (!fs.existsSync(resolved)) {
        if (fs.existsSync(resolved + '.ts')) resolved += '.ts'
        else if (fs.existsSync(resolved + '.tsx')) resolved += '.tsx'
        else if (fs.existsSync(resolved + '.js')) resolved += '.js'
        else if (fs.existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts')
      }
      const code = fs.readFileSync(resolved, 'utf8')
      const js = ts.transpileModule(code, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
      }).outputText
      const subModule = { exports: {} }
      const subContext = {
        ...context,
        exports: subModule.exports,
        module: subModule,
        require: createResolver(path.dirname(resolved))
      }
      vm.runInNewContext(js, subContext, { filename: resolved })
      return subModule.exports
    }
    return require(name)
  }
}
const context = {
  exports: {},
  require: createResolver(path.dirname(file)),
  window: { api }, document,
  setTimeout: timer, clearTimeout: item => timers.delete(item),
  setInterval: timer, clearInterval: item => timers.delete(item)
}
vm.runInNewContext(output, context, { filename: file })
function render() {
  cursor = 0
  renders++
  view = context.exports.useAppStore()
  while (effects.length) effects.shift()()
}

async function run() {
  render()
  events.status('running')
  await flush()
  assert.equal(view.loading, false, 'slow Windows proxy synchronization does not block the workspace')
  systemProxy.resolve({ enabled: false })
  await flush()
  await flush()
  assert.equal(view.loading, false, 'base data unlocks workspace while rules/connections are pending')
  assert.equal(baseCalls, 1, 'status event shares the pending startup refresh')
  assert.equal(connectionsCalls, 1, 'one connections request on startup')
  assert.equal(view.error, null, 'transient dataset error retries silently')
  const retry = [...timers].find(t => t.ms === 1000)
  assert.ok(retry)
  timers.delete(retry)
  retry.fn()
  await flush()
  assert.equal(view.proxies.PROXY.name, 'ready', 'proxies retry independently of pending rules')

  const before = renders
  for (let i = 0; i < 350; i++) events.log({ type: 'info', payload: String(i), time: 'now' })
  await flush()
  assert.equal(renders, before, 'offscreen logs do not render the application')
  view.setActiveTab('logs')
  await flush()
  assert.equal(view.sessionStartedAt, 12345, 'navigation preserves the core session timestamp')
  assert.equal(view.logs.length, 300)
  assert.equal(view.logs[0].payload, '50', 'bounded log history preserved')
  const beforeTraffic = renders
  events.traffic({ up: 42, down: 99 })
  await flush()
  assert.equal(renders, beforeTraffic, 'traffic does not render the logs page')
  events.log({ type: 'info', payload: 'batched', time: 'now' })
  const logTimer = [...timers].find(t => t.ms === 250)
  logTimer.fn()
  await flush()
  assert.equal(view.logs.at(-1).payload, 'batched', 'visible logs publish on the batch interval')
  view.clearLogs()
  await flush()
  logTimer.fn()
  await flush()
  assert.equal(view.logs.length, 0, 'clearing also empties the retained buffer')

  rules.resolve([{ type: 'MATCH', payload: '', proxy: 'PROXY' }])
  connections.resolve({ uploadTotal: 1, downloadTotal: 2, connections: [] })
  await flush()
  assert.equal(view.rules.length, 0, 'late rules response cannot retain data on an unrelated page')
  assert.equal(view.connections.downloadTotal, 0, 'snapshot for an old view is discarded')
  view.setActiveTab('dashboard')
  await flush()
  assert.equal(ruleScopes.at(-1), 'summary', 'dashboard requests only routing labels')
  assert.equal(view.rules.length, 1, 'dashboard summary loads independently')
  assert.equal(view.traffic.up, 42)
  assert.equal(connectionsCalls, 2)
  document.visibilityState = 'hidden'
  listeners.get('visibilitychange')()
  await flush()
  assert.equal([...timers].filter(t => t.ms === 2000).length, 0, 'hidden window suspends connections polling')
  assert.equal(view.sessionStartedAt, 12345, 'hiding the application preserves session uptime')
  assert.equal(view.rules.length, 0, 'hidden window releases routing data')
  backendState = 'stopped'
  events.status(backendState)
  await flush()
  assert.equal(view.coreStatus, 'stopped')
  assert.equal(view.sessionStartedAt, null, 'stopping the core ends the session')
  assert.equal(view.connections.downloadTotal, 0)
  const beforeStart = baseCalls, beforeProxies = proxyCalls
  assert.equal(await view.toggleKernel(), true)
  await flush()
  assert.equal(view.coreStatus, 'running')
  assert.equal(view.sessionStartedAt, 20000, 'a new core session uses its new backend timestamp')
  assert.equal(baseCalls, beforeStart + 1, 'start event and completed action produce one refresh')
  assert.equal(proxyCalls, beforeProxies + 1, 'core datasets load once after the action')
  assert.equal(connectionsCalls, 2, 'starting while hidden does not resume polling')
  document.visibilityState = 'visible'
  listeners.get('visibilitychange')()
  await flush()
  view.setActiveTab('rules')
  await flush()
  assert.equal(ruleScopes.at(-1), undefined, 'rules page requests the complete dataset')
  assert.equal(view.rules.length, 1)
  view.setActiveTab('profiles')
  await flush()
  assert.equal(view.rules.length, 0, 'leaving the rules page releases its complete dataset')
  assert.equal(view.connections.downloadTotal, 0, 'unrelated pages release connection snapshots')
  view.setActiveTab('logs')
  await flush()
  events.log({ type: 'info', payload: 'retained history', time: 'now' })
  const visibleLogTimer = [...timers].find(t => t.ms === 250)
  visibleLogTimer.fn()
  await flush()
  assert.equal(view.logs.at(-1).payload, 'retained history')
  view.setActiveTab('profiles')
  await flush()
  assert.equal(view.logs.length, 0, 'leaving logs releases the displayed array')
  view.setActiveTab('logs')
  await flush()
  assert.equal(view.logs.at(-1).payload, 'retained history', 'bounded history survives releasing the displayed array')
  console.log('PASS renderer store: progressive loading, independent retry, single snapshot owner, buffered logs, relevant traffic, visibility pause, stale result protection')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
