const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const yaml = require('yaml')

const root = path.resolve(__dirname, '../artifacts/offline-proxy-check')
fs.mkdirSync(root, { recursive: true })
const paths = { mihomoDir: root, profilesDir: root, profilesFilePath: path.join(root, 'profiles.json'), geoFilesDir: root, activeConfigPath: path.join(root, 'active.yaml') }
const logger = { info() {}, warn() {}, error() {} }
let state = 'stopped', starts = 0, apiReads = 0, apiSelections = [], closed = 0, live = {}
class ProcessFixture extends EventEmitter {
  getState() { return state }
  async start() { starts++; state = 'running'; this.emit('state-change', state) }
  async stop() { state = 'stopped'; this.emit('state-change', state) }
}
class ApiFixture extends EventEmitter {
  reconfigure() {} startTrafficStream() {} startLogStream() {} stopAllStreams() {}
  async getProxies() { apiReads++; assert.equal(state, 'running'); return live }
  async selectProxy(group, node) { assert.equal(state, 'running'); apiSelections.push([group, node]); live[group].now = node }
  async closeAllConnections() { closed++ }
}
const dependencies = {
  '../utils/paths': { getAppPaths: () => paths }, '../utils/logger': { logger },
  '../utils/elevation': { isProcessElevated: () => false },
  '../core/MihomoProcessManager': { MihomoProcessManager: ProcessFixture },
  '../core/MihomoApiClient': { MihomoApiClient: ApiFixture },
  './GeoIpService': { GeoIpService: class { captureOrigin() { return Promise.resolve() } dispose() {} } },
  '../utils/local-geoip': { LocalGeoIp: class {} }
}
function load(file) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInThisContext(`(function(exports, require) { ${code}\n})`, { filename: file })(exports, name => {
    if (dependencies[name]) return dependencies[name]
    if (name.endsWith('.json') && name.startsWith('.')) return require(path.resolve(path.dirname(file), name))
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts') : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    return target && fs.existsSync(target) ? load(target) : require(name)
  })
  return exports
}
async function run() {
  const config = structuredClone(load('src/shared/app-config.ts').DEFAULT_APP_CONFIG)
  config.general.autoConnect = false
  config.general.autoCloseConnection = true
  config.activeProfileId = 'profile'
  const settings = { getSettings: () => config }
  fs.writeFileSync(paths.profilesFilePath, JSON.stringify([{ id: 'profile', name: 'Offline test', type: 'local', updatedAt: 123 }]))
  fs.writeFileSync(path.join(root, 'provider.yaml'), yaml.stringify({ proxies: [{ name: 'Berlin', type: 'vless', server: 'not-exposed.example', uuid: 'secret' }] }))
  fs.writeFileSync(path.join(root, 'profile.yaml'), yaml.stringify({
    proxies: [{ name: 'Amsterdam', type: 'vless', server: 'private.example', uuid: 'secret' }, { name: 'Paris', type: 'ss', password: 'secret' }],
    'proxy-providers': { cached: { path: './provider.yaml' }, embedded: { type: 'inline', payload: [{ name: 'Tokyo', type: 'trojan', password: 'secret' }] }, absent: { path: './missing.yaml' } },
    'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: ['Amsterdam', 'Paris', 'DIRECT'] }, { name: 'Providers', type: 'select', use: ['cached', 'embedded'] }, { name: 'Filtered', type: 'select', 'include-all': true, filter: 'Paris|Berlin', 'exclude-filter': 'Berlin' }, { name: 'Pending', type: 'select', use: ['absent'] }],
    rules: ['MATCH,PROXY']
  }))
  const { ProfileService } = load('src/main/services/ProfileService.ts')
  let profiles = new ProfileService(settings)
  await profiles.initialize()
  const { KernelService } = load('src/main/services/KernelService.ts')
  let kernel = new KernelService(settings, profiles)
  await kernel.initialize()
  live = await kernel.getProxies()
  assert.deepEqual(live.PROXY.all, ['Amsterdam', 'Paris', 'DIRECT'])
  assert.deepEqual(live.Providers.all, ['Berlin', 'Tokyo'])
  assert.deepEqual(live.Filtered.all, ['Paris'])
  assert.deepEqual(live.Pending.all, [])
  assert.equal(JSON.stringify(live).includes('secret'), false, 'catalog contains display metadata, never credentials')
  await kernel.selectProxy('PROXY', 'Paris')
  assert.equal((await kernel.getProxies()).PROXY.now, 'Paris')
  assert.equal(profiles.getActiveProfile().updatedAt, 123, 'node choice does not change subscription update date')
  assert.equal(JSON.parse(fs.readFileSync(paths.profilesFilePath)).at(0).selectedGroupProxies.PROXY, 'Paris')
  await assert.rejects(kernel.selectProxy('PROXY', 'Tokyo'), /not available/)
  assert.equal(starts, 0)
  assert.equal(apiReads, 0)
  assert.equal(closed, 0)
  assert.deepEqual(apiSelections, [])
  await kernel.dispose()
  profiles = new ProfileService(settings)
  await profiles.initialize()
  kernel = new KernelService(settings, profiles)
  assert.equal((await kernel.getProxies()).PROXY.now, 'Paris', 'offline selection survives app restart')
  await kernel.start()
  assert.equal(starts, 1)
  assert.deepEqual(apiSelections.at(-1), ['PROXY', 'Paris'], 'connection applies the saved offline selection')
  await kernel.selectProxy('PROXY', 'Amsterdam')
  assert.equal(closed, 1, 'live selection retains auto-close-connections behavior')
  await kernel.stop()
  assert.equal((await kernel.getProxies()).PROXY.now, 'Amsterdam')
  assert.equal(starts, 1, 'viewing and switching while stopped never starts the core')
  await kernel.dispose()
  console.log('PASS: offline profile/provider catalog, filters, private metadata, validated persistent selection, restart restoration and no implicit VPN startup')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
