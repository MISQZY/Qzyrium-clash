// Isolated GeoIP/route checks. No DNS, network, real core or OS proxy changes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')
function load(file, dependencies) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const exports = {}
  vm.runInThisContext(`(function(exports, require) {${output}\n})`, { filename: file })(exports, (name) => {
    if (dependencies[name]) return dependencies[name]
    if (name.endsWith('.json') && name.startsWith('.')) return require(path.resolve(path.dirname(file), name))
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts')
      : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    return target && fs.existsSync(target) ? load(target, {}) : require(name)
  })
  return exports
}

async function main() {
  const requests = [], lookups = []
  let failure = false, primaryDown = false, originOnlineDown = false, latitude = 52, local = '192.168.1.2'
  const { GeoIpService, publicIp } = load('src/main/services/GeoIpService.ts', {
    axios: { get: async (url, options) => {
      requests.push({ url, options })
      if (originOnlineDown && ['https://ipwho.is/', 'https://ipapi.co/json/'].includes(url)) throw new Error('Origin provider unavailable')
      if (failure || primaryDown && url.startsWith('https://ipwho.is/')) throw new Error('Offline')
      const ip = new URL(url).pathname.split('/')[1]
      return { data: { success: true, ip: !ip || ip === 'json' ? '8.8.8.8' : decodeURIComponent(ip), longitude: 5, latitude, city: 'Amsterdam', country: 'Netherlands' } }
    } },
    'node:dns/promises': { lookup: async (host) => { lookups.push(host); return { address: '1.1.1.1' } } },
    'node:os': { networkInterfaces: () => ({ Ethernet: [{ internal: false, address: local }] }) }
  })
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '198.18.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1', 'not-an-ip']) assert.equal(publicIp(ip), false, ip)
  assert.equal(publicIp('8.8.8.8'), true)
  assert.equal(publicIp('2606:4700:4700::1111'), true)
  const service = new GeoIpService()
  assert.equal(await service.locateHost('192.168.1.1'), null)
  assert.equal(requests.length, 0)
  const [a, b] = await Promise.all([service.locateHost('1.1.1.1'), service.locateHost('1.1.1.1')])
  assert.deepEqual(a, b)
  assert.equal(requests.length, 1, 'concurrent queries share the cache')
  await service.locateHost('vpn.example.com')
  assert.equal(lookups.length, 1)
  await Promise.all([service.locateHost('vpn.example.com'), service.locateHost('vpn.example.com')])
  assert.equal(lookups.length, 1, 'hostname lookups share a TTL cache')
  assert.equal(requests.length, 1, 'hostname resolves to the cached IP')
  assert.equal(requests[0].options.proxy, false)
  assert.equal(requests[0].options.timeout, 2500)
  await service.captureOrigin()
  await service.captureOrigin()
  assert.equal(requests.length, 2, 'origin cached on the same network')
  local = '192.168.2.2'
  await service.captureOrigin()
  assert.equal(requests.length, 3, 'network change refreshes the public origin')
  failure = true
  assert.equal(await service.locateHost('9.9.9.9'), null)
  await service.locateHost('9.9.9.9')
  assert.equal(requests.length, 5, 'both providers fail once, then the failure is cached')
  failure = false; latitude = 100
  assert.equal(await service.locateHost('8.8.4.4'), null, 'invalid coordinates are rejected')
  latitude = 52; primaryDown = true
  assert.equal((await service.locateHost('4.2.2.1')).ip, '4.2.2.1', 'secondary GeoIP provider works when primary is unavailable')

  const helpers = load('src/main/utils/globe-routes.ts', {})
  const { connectionRoutes } = load('src/renderer/src/lib/globe.ts', { '../i18n/catalogs': { translate: (_locale, _namespace, key) => key } })
  const located = { origin: a, routes: [{ node: 'fixture', location: a }] }
  assert.deepEqual(connectionRoutes({ ...located, origin: null }, {}, {}), [], 'missing origin cannot fabricate a route from Moscow')
  assert.deepEqual(connectionRoutes(located, {}, {}, undefined, 'rule', undefined, 'en', true), [], 'stopped/connecting state cannot create gray tunnels')
  const profileHelpers = load('src/main/utils/globe-profile.ts', {})
  const offlineHelpers = load('src/main/utils/offline-proxies.ts', {})
  const compact = profileHelpers.globeProfile({
    proxies: [{ name: 'node', server: 'vpn.example.com', password: 'secret', certificate: 'x'.repeat(100000) }],
    'proxy-groups': [{ name: 'GROUP', proxies: ['node'] }],
    rules: Array.from({ length: 10000 }, (_, i) => `DOMAIN,host${i}.example,GROUP`),
    dns: { nameserver: ['1.1.1.1'] }
  })
  assert.ok(JSON.stringify(compact).length < 300, 'globe cache retains addresses and unique targets, not full profiles')
  assert.deepEqual(compact.rules, ['MATCH,GROUP'])
  const { LocalGeoIp } = load('src/main/utils/local-geoip.ts', { './country-centers.json': JSON.parse(fs.readFileSync('src/main/utils/country-centers.json', 'utf8')) })
  const localDb = new LocalGeoIp(() => require('node:path').resolve('extra/files/geoip.dat'))
  let beats = 0
  const heartbeat = setInterval(() => beats++, 1)
  try {
    const results = await Promise.all(['8.8.8.8', '77.88.8.8', '223.5.5.5', '2001:4860:4860::8888'].map((ip) => localDb.lookup(ip)))
    assert.deepEqual(results.map((result) => result?.country), ['United States', 'Russia', 'China', 'United States'])
    assert.ok(results.every((result) => result.precision === 'country' && Number.isFinite(result.latitude)))
    assert.ok(beats > 0, 'GeoIP scan runs off the main event loop')
    localDb.shutdownWorker()
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal((await localDb.lookup('8.8.8.8'))?.country, 'United States', 'GeoIP worker restarts after releasing its idle database')
  } finally { clearInterval(heartbeat); localDb.dispose() }
  const offlineService = new GeoIpService({ lookup: async (ip) => ({ ...a, ip, precision: 'country' }), dispose() {} })
  primaryDown = false
  const beforeOffline = requests.length
  await offlineService.captureOrigin()
  assert.equal(offlineService.getOrigin().precision, 'city', 'online city coordinates take precedence over a country center')
  assert.equal(requests.length, beforeOffline + 2, 'origin prepares precise coordinates and an independent local fallback')
  await offlineService.locateHost('9.9.9.8')
  assert.equal(requests.length, beforeOffline + 2, 'server coordinates use the local database without HTTP')
  originOnlineDown = true
  await offlineService.captureOrigin(true)
  assert.equal(offlineService.getOrigin().precision, 'country', 'local country location remains available when online GeoIP fails')
  const nativeTimeout = AbortSignal.timeout, originDeadline = new AbortController()
  let releaseLateLocation
  const boundedService = new GeoIpService({ lookup: () => new Promise(resolve => { releaseLateLocation = resolve }), dispose() {} })
  let boundedCapture
  try {
    AbortSignal.timeout = milliseconds => { assert.equal(milliseconds, 2500, 'origin uses one total deadline under 3 seconds'); return originDeadline.signal }
    boundedCapture = boundedService.captureOrigin()
  } finally { AbortSignal.timeout = nativeTimeout }
  await new Promise(resolve => setImmediate(resolve))
  originDeadline.abort()
  await boundedCapture
  assert.equal(boundedService.getOrigin(), null, 'slow geolocation cannot delay TUN beyond the origin deadline')
  releaseLateLocation(a)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(boundedService.getOrigin(), null, 'late origin results cannot overwrite a timed-out capture')
  boundedService.dispose()
  assert.equal(helpers.serverHost('2606:4700:4700::1111'), '2606:4700:4700::1111')
  assert.equal(helpers.serverHost('[2606:4700:4700::1111]:443'), '2606:4700:4700::1111')
  const candidates = helpers.globeCandidates({ connections: [] }, { GROUP: { now: 'AUTO' }, AUTO: { now: 'idle' } }, { rules: ['MATCH,GROUP'] }, new Map([['idle', 'vpn.example.com']]), 'rule')
  assert.deepEqual([...candidates], [['idle', ['vpn.example.com']]], 'selected nested node appears even without active network sockets')
  assert.equal(helpers.globeCandidates({ connections: [] }, { GLOBAL: { now: 'DIRECT' } }, {}, new Map(), 'global').size, 0)

  const empty = class {}
  const { KernelService } = load('src/main/services/KernelService.ts', {
    '../utils/offline-proxies': offlineHelpers,
    '../utils/globe-profile': profileHelpers,
    '../utils/elevation': { isProcessElevated: () => false },
    '../core/MihomoApiClient': { MihomoApiClient: empty }, '../core/MihomoConfigFactory': {}, '../core/MihomoProcessManager': { MihomoProcessManager: empty }, '../utils/logger': {}, '../utils/paths': {}, '@shared/ipc': {}, './GeoIpService': { GeoIpService }, '../utils/globe-routes': helpers, '../utils/local-geoip': { LocalGeoIp }
  })
  const kernel = Object.create(KernelService.prototype)
  const hosts = []
  kernel.getStatus = () => 'running'
  kernel.settingService = { getSettings: () => ({ kernel: { mode: 'rule', tun: { enable: false } } }) }
  kernel.geoIp = { getOrigin: () => a, locateHost: async (host) => { hosts.push(host); return a } }
  kernel.profileService = { getActiveProfile: () => ({ id: 'fixture' }), getProfileContent: () => 'proxies:\n  - name: fallback\n    server: fallback.example.com' }
  kernel.getProxies = async () => ({ GROUP: { now: 'node' } })
  kernel.getConnections = async () => ({ connections: [
    { chains: ['node', 'GROUP'], metadata: { destinationIP: 'website-ip', remoteDestination: '1.1.1.1:443' } },
    { chains: ['v6'], metadata: { remoteDestination: '[2606:4700:4700::1111]:443' } },
    { chains: ['DIRECT'], metadata: { remoteDestination: '8.8.8.8:443' } },
    { chains: ['fallback'], metadata: {} },
    { chains: ['unknown'], metadata: { destinationIP: 'website-ip' } }
  ] })
  const result = await kernel.getGlobeLocations()
  assert.deepEqual(hosts, ['1.1.1.1', '2606:4700:4700::1111', 'fallback.example.com'])
  assert.equal(result.routes.length, 3, 'direct, groups and unknown server locations are excluded')
  kernel.getStatus = () => 'stopped'
  assert.deepEqual((await kernel.getGlobeLocations()).routes, [], 'stopped core cannot produce profile-based tunnels')
  kernel.getStatus = () => 'running'
  kernel.getConnections = async () => ({ connections: [] })
  kernel.getProxies = async () => ({ GROUP: { now: 'idle' } })
  kernel.profileService.getProfileContent = () => 'rules:\n  - MATCH,GROUP\nproxy-providers:\n  inline:\n    type: inline\n    payload:\n      - name: idle\n        server: vpn.example.com'
  assert.equal((await kernel.getGlobeLocations()).routes[0].node, 'idle', 'provider payload resolves the selected idle tunnel')
  kernel.geoIp.getOrigin = () => null
  kernel.geoIp.captureOrigin = async () => { throw Error('Must not resolve the physical origin through TUN') }
  kernel.settingService.getSettings = () => ({ kernel: { mode: 'rule', tun: { enable: true } } })
  const missingOrigin = await kernel.getGlobeLocations()
  assert.equal(missingOrigin.status, 'origin-unavailable')
  assert.deepEqual(missingOrigin.pendingNodes, ['idle'])
  assert.equal(missingOrigin.routes.length, 1, 'known server remains available when source GeoIP fails')
  kernel.settingService.getSettings = () => ({ kernel: { mode: 'rule', tun: { enable: false } } })
  kernel.geoIp.captureOrigin = async () => { kernel.geoIp.getOrigin = () => a }
  assert.equal((await kernel.getGlobeLocations()).status, 'ready', 'missing origin retries safely without TUN')
  kernel.geoGeneration = 0
  kernel.profileService.getProfileContent = async () => ''
  kernel.getProxies = async () => ({})
  let activeRequests = 0, maximumRequests = 0, locationRequests = 0, snapshots = 0
  const flush = () => new Promise(resolve => setImmediate(resolve))
  kernel.geoIp.locateHost = async () => {
    locationRequests++
    maximumRequests = Math.max(maximumRequests, ++activeRequests)
    await flush()
    activeRequests--
    return a
  }
  kernel.getConnections = async () => {
    snapshots++
    return { connections: Array.from({ length: 12 }, (_, index) => ({ chains: [`node${index}`], metadata: { remoteDestination: `1.1.1.${index + 1}:443` } })) }
  }
  const first = kernel.getGlobeLocations(), duplicate = kernel.getGlobeLocations()
  assert.equal(first, duplicate, 'concurrent globe requests share one operation')
  assert.equal((await first).routes.length, 12)
  assert.equal(snapshots, 1, 'deduplication includes core snapshot queries')
  assert.equal(maximumRequests, 3, 'geolocation concurrency is bounded')
  const stale = kernel.getGlobeLocations()
  kernel.invalidateGlobe()
  assert.deepEqual((await stale).routes, [], 'lifecycle changes discard stale routes')
  assert.equal(locationRequests, 12, 'invalidated queues launch no further lookups')

  let state = 'stopped', starts = 0, stops = 0, syntheses = 0, originFinished = false
  let releaseProfile, releaseOrigin
  let raw = 'proxies: []', customRules = [{ type: 'MATCH', proxy: 'DIRECT', enabled: true }]
  let profileRead = new Promise(resolve => { releaseProfile = resolve })
  let originRead = new Promise(resolve => { releaseOrigin = () => { originFinished = true; resolve() } })
  const { KernelService: LifecycleKernel } = load('src/main/services/KernelService.ts', {
    '../utils/offline-proxies': offlineHelpers,
    '../utils/globe-profile': profileHelpers,
    '../utils/elevation': { isProcessElevated: () => true },
    fs: { constants: { COPYFILE_EXCL: 1 }, promises: { copyFile: async () => {}, writeFile: async () => {} } },
    '../core/MihomoApiClient': {}, '../core/MihomoProcessManager': {},
    '../core/MihomoConfigFactory': { MihomoConfigFactory: { synthesize: (_raw, _settings, rules) => { syntheses++; assert.deepEqual(rules, customRules); return 'fixture' } } },
    '../utils/logger': { logger: { info() {} } },
    '../utils/paths': { getAppPaths: () => ({ geoFilesDir: 'geo', mihomoDir: 'mihomo', activeConfigPath: 'config.yaml' }) },
    './GeoIpService': {}, '../utils/local-geoip': {}, '../utils/globe-routes': helpers
  })
  const lifecycle = Object.create(LifecycleKernel.prototype)
  lifecycle.lifecycle = Promise.resolve()
  lifecycle.geoGeneration = 0
  lifecycle.settingService = { getSettings: () => ({ kernel: { tun: { enable: true } } }) }
  lifecycle.geoIp = { captureOrigin: () => originRead }
  lifecycle.profileService = { getActiveProfile: () => ({ id: 'fixture' }), getProfileContent: async () => { await profileRead; return raw }, getCustomRules: () => customRules }
  lifecycle.apiClient = { reconfigure() {}, stopAllStreams() {} }
  lifecycle.processManager = { getState: () => state, start: async () => { assert.ok(originFinished, 'TUN waits for physical origin capture'); starts++; state = 'running' }, stop: async () => { stops++; state = 'stopped' } }
  const pendingStart = lifecycle.start(), duplicateStart = lifecycle.start(), pendingStop = lifecycle.stop()
  await flush()
  assert.equal(starts, 0, 'capture and configuration IO finish before spawning')
  releaseOrigin(); releaseProfile()
  await Promise.all([pendingStart, duplicateStart, pendingStop])
  assert.equal(starts, 1, 'parallel starts synthesize and spawn only once')
  assert.equal(syntheses, 1)
  assert.equal(state, 'stopped', 'stop during async preparation cannot leave a late process running')
  profileRead = Promise.resolve(); originRead = Promise.resolve()
  await lifecycle.start()
  await lifecycle.restart()
  assert.equal(syntheses, 1, 'unchanged restart reuses synthesized YAML')
  customRules = [...customRules, { type: 'DOMAIN', payload: 'example.com', proxy: 'DIRECT' }]
  await lifecycle.restart()
  assert.equal(syntheses, 2, 'custom rule changes invalidate synthesized YAML')
  raw = 'proxies: []\nrules: []'
  await lifecycle.restart()
  assert.equal(syntheses, 3, 'profile content changes invalidate synthesized YAML')
  assert.ok(stops >= 3)
  console.log('PASS: GeoIP fallback/DNS cache/deadline, idle tunnels/providers/IPv6, bounded/deduplicated globe requests, stale results, serialized lifecycle and YAML/custom-rule cache')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
