// Real React context regression with isolated IPC fixtures. No VPN or OS settings.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

if (process.type === 'renderer') {
  const ts = require('typescript')
  const vm = require('node:vm')
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const root = path.resolve(__dirname, '..')
  const cache = new Map()
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename)
    const exports = {}
    cache.set(filename, exports)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText
    new vm.Script(`(function(exports,require){${code}\n})`, { filename }).runInThisContext()(exports, name => {
      const target = name.startsWith('@shared/') ? path.join(root, 'src/shared', name.slice(8))
        : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null
      if (target?.endsWith('.json')) return require(target)
      if (target && fs.existsSync(target + '.ts')) return load(target + '.ts')
      if (target && fs.existsSync(path.join(target, 'index.ts'))) return load(path.join(target, 'index.ts'))
      return require(name)
    })
    return exports
  }
  const stores = load(path.join(root, 'src/renderer/src/stores/useAppStore.ts'))
  const config = structuredClone(load(path.join(root, 'src/shared/app-config.ts')).DEFAULT_APP_CONFIG)
  config.general.connectionInterval = 60_000
  const listeners = {}
  window.api = {
    app: { getBootSnapshot: async () => ({ settings: config, profiles: [], activeProfile: null,
      coreStatus: 'running', sessionStartedAt: 1, sysProxy: { enabled: false } }) },
    mihomo: { getProxies: async () => ({}), getRules: async () => [],
      getConnections: async () => ({ connections: [], downloadTotal: 0, uploadTotal: 0 }) },
    events: Object.fromEntries(['onTraffic', 'onLog', 'onCoreStatus'].map(name => [name, callback => {
      listeners[name] = callback
      return () => { delete listeners[name] }
    }]))
  }
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  const counts = { shell: 0, settings: 0, profiles: 0, traffic: 0, logs: 0 }
  let navigation
  function Shell() { counts.shell++; navigation = stores.useNavigation(); return null }
  function Settings() { counts.settings++; stores.useSettings(); return null }
  function Profiles() { counts.profiles++; stores.useProfiles(); return null }
  function Traffic() { counts.traffic++; stores.useTraffic(); return null }
  function Logs() { counts.logs++; stores.useLogs(); return null }
  window.subscriptionTest = {
    snapshot: () => ({ counts: { ...counts }, ready: !!navigation && !navigation.loading }),
    traffic: () => listeners.onTraffic({ up: 123, down: 456 }),
    logs: () => listeners.onLog({ type: 'info', payload: 'visible log', time: new Date().toISOString() }),
    navigate: tab => navigation.setActiveTab(tab)
  }
  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.createElement('div')
    document.body.append(mount)
    createRoot(mount).render(React.createElement(stores.AppStoreProvider, null,
      ...[Shell, Settings, Profiles, Traffic, Logs].map(component => React.createElement(component, { key: component.name }))))
  }, { once: true })
} else {
  const assert = require('node:assert/strict')
  app.setPath('userData', path.resolve(__dirname, '../artifacts/subscriptions-ui/user-data'))
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: {
      preload: __filename, nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false
    } })
    win.webContents.on('preload-error', (_event, _path, error) => console.error(error))
    win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message) })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    const snapshot = () => evaluate('window.subscriptionTest.snapshot()')
    const waitFor = async predicate => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await predicate()) return
        await wait(25)
      }
      throw new Error('Timed out waiting for a context publication')
    }
    try {
      await win.loadURL('data:text/html,<html><body></body></html>')
      await waitFor(async () => (await snapshot()).ready)
      await wait(100)
      const before = (await snapshot()).counts
      await evaluate('window.subscriptionTest.traffic()')
      await waitFor(async () => (await snapshot()).counts.traffic > before.traffic)
      const afterTraffic = (await snapshot()).counts
      for (const domain of ['shell', 'settings', 'profiles', 'logs']) assert.equal(afterTraffic[domain], before[domain], `${domain} does not render on traffic`)
      await evaluate("window.subscriptionTest.navigate('logs')")
      await wait(100)
      const beforeLogs = (await snapshot()).counts
      await evaluate('window.subscriptionTest.logs()')
      await waitFor(async () => (await snapshot()).counts.logs > beforeLogs.logs)
      const afterLogs = (await snapshot()).counts
      for (const domain of ['shell', 'settings', 'profiles', 'traffic']) assert.equal(afterLogs[domain], beforeLogs[domain], `${domain} does not render on logs`)
      console.log('PASS: real React consumers isolate traffic and logs from the shell, settings and profiles')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
