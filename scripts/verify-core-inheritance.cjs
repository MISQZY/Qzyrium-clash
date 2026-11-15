const assert = require('node:assert/strict')
const yaml = require('yaml')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')
const { DEFAULT_APP_CONFIG } = load('src/shared/app-config.ts')
const { resolveEffectiveCore } = load('src/shared/effective-core.ts')
const { MihomoConfigFactory } = load('src/main/core/MihomoConfigFactory.ts')
const { restoreSettings, createInitialSettings } = load('src/main/core/SettingsFactory.ts')
const { pacScript } = load('src/main/utils/pac.ts')

async function verify() {
  const config = structuredClone(DEFAULT_APP_CONFIG)
  const profile = { 'mixed-port': 8100, port: 8101, 'socks-port': 8102, 'log-level': 'debug', rules: ['MATCH,DIRECT'] }
  const legacy = structuredClone(config)
  delete legacy.kernel.inheritMixedPort; delete legacy.kernel.inheritLogLevel
  const migrated = restoreSettings(legacy, createInitialSettings(() => 'fixture'))
  assert.equal(migrated.kernel.inheritMixedPort, false)
  assert.equal(migrated.kernel.inheritLogLevel, false)
  assert.equal(resolveEffectiveCore(profile, migrated).ports['mixed-port'].value, config.kernel.mixedPort)
  assert.equal(resolveEffectiveCore(profile, migrated).logLevel.value, 'info')
  config.kernel.inheritMixedPort = true; config.kernel.inheritLogLevel = true
  const values = resolveEffectiveCore(profile, config)
  assert.deepEqual(values.ports['mixed-port'], { value: 8100, source: 'profile' })
  assert.deepEqual(values.logLevel, { value: 'debug', source: 'profile' })
  const output = yaml.parse(MihomoConfigFactory.synthesize(yaml.stringify(profile), config))
  for (const key of ['mixed-port', 'port', 'socks-port', 'log-level']) assert.equal(output[key], profile[key])
  config.kernel.options = { port: 8201, 'socks-port': 0 }
  const override = yaml.parse(MihomoConfigFactory.synthesize(yaml.stringify(profile), config))
  assert.equal(override.port, 8201); assert.equal(override['socks-port'], 0)
  assert.equal(resolveEffectiveCore({}, config).ports['mixed-port'].source, 'default')
  assert.throws(() => resolveEffectiveCore({ ...profile, 'mixed-port': config.kernel.controllerPort }, config), /unique/)
  assert.throws(() => resolveEffectiveCore({ ...profile, 'mixed-port': '8100' }, config), /Invalid mixed-port/)
  assert.throws(() => resolveEffectiveCore({ ...profile, 'log-level': 'verbose' }, config), /log level/)
  assert.match(pacScript(config, 8100), /127\.0\.0\.1:8100/)

  const requests = []
  const { KernelService } = load('src/main/services/KernelService.ts', { electron: { powerMonitor: new (require('node:events').EventEmitter)() } })
  let reads = 0
  const kernel = Object.assign(Object.create(KernelService.prototype), {
    settingService: { getSettings: () => config },
    profileService: { getActiveProfile: () => ({ id: 'fixture', name: 'Fixture' }), getProfileContent: async () => { reads++; return yaml.stringify(profile) }, getCustomRules: () => [{ id: 'custom', type: 'DOMAIN', payload: 'example.com', proxy: 'DIRECT', position: 'top' }] }
  })
  assert.deepEqual(await kernel.getEffectiveCore(), resolveEffectiveCore(profile, config))
  assert.equal((await kernel.getEffectiveCore({ kernel: { ...config.kernel, inheritMixedPort: false } })).ports['mixed-port'].source, 'override')
  assert.equal(config.kernel.inheritMixedPort, true, 'draft preview never mutates saved settings')
  assert.equal(reads, 2, 'preview reads the profile without starting a core or writing runtime files')
  profile.tun = { enable: true, stack: 'system', mtu: 1450, 'dns-hijack': ['any:53'] }
  const preview = await kernel.getConfigPreview()
  assert.equal(preview.original, yaml.stringify(profile))
  assert.equal(preview.profileName, 'Fixture')
  assert.equal(yaml.parse(preview.effective)['mixed-port'], 8100)
  assert.equal(yaml.parse(preview.effective).rules[0], 'DOMAIN,example.com,DIRECT')
  assert.deepEqual(yaml.parse(preview.effective).tun, { ...profile.tun, enable: false }, 'comparison retains the profile TUN block and shows its disabled state')
  kernel.profileService.getActiveProfile = () => null
  assert.equal((await kernel.getConfigPreview()).original, '', 'no profile still previews the default config')
  const { SubscriptionClient } = load('src/main/core/SubscriptionClient.ts', { axios: { get: async (_url, options) => {
    requests.push(options); return { status: 200, data: 'rules: []', headers: {} }
  } } })
  await new SubscriptionClient(() => config, () => true, { proxyPort: async () => 8100,
    resolve: async () => [{ address: '203.0.113.1', family: 4 }] }).download('https://example.invalid/sub', undefined, true)
  assert.equal(requests[0].proxy.port, 8100, 'subscription proxy uses the running listener, not the saved fallback')
  const registry = []
  config.sysProxy.enable = true
  const { SysProxyService } = load('src/main/services/SysProxyService.ts', {
    '../utils/network-transition': { flushSystemDns() {}, notifySystemProxyChanged() {} }
  })
  const proxy = new SysProxyService({ getSettings: () => config }, {
    capture: async () => {}, restore: async () => {}, set: async (...args) => registry.push(args)
  })
  proxy.setPortProvider(async () => 8100)
  try {
    await proxy.setCoreRunning(true)
    assert.equal(proxy.getStatus().port, 8100)
    if (process.platform === 'win32') assert.ok(registry.some(args => args[0] === 'ProxyServer' && args[1] === '127.0.0.1:8100'))
  } finally { await proxy.dispose() }
  console.log('PASS: legacy migration, inheritance/overrides/defaults, effective port collisions, PAC and subscription proxy routing')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
