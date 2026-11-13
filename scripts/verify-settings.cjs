const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const yaml = require('yaml')

function load(file, dependencies = {}, overrides = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const requireModule = name => {
    if (dependencies[name]) return dependencies[name]
    if (name === '../utils/atomicWrite' && dependencies.fs) return { writeFileAtomicAsync: (...args) => dependencies.fs.promises.writeFile(...args) }
    if (name.endsWith('.json') && name.startsWith('.')) return require(path.resolve(path.dirname(file), name))
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts') : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    return target && fs.existsSync(target) ? load(target) : require(name)
  }
  vm.runInThisContext(`(function(exports, require, setTimeout, clearTimeout, process, Date) {\n${code}\n})`, { filename: file })(exports, requireModule, overrides.setTimeout ?? setTimeout, overrides.clearTimeout ?? clearTimeout, overrides.process ?? process, overrides.Date ?? Date)
  return exports
}
const logger = { info() {}, warn() {}, error() {}, debug() {}, configureSettings() {} }
const { DEFAULT_APP_CONFIG } = load('src/shared/app-config.ts')
const { validateAppConfig } = load('src/shared/settings-validation.ts')
const { MihomoConfigFactory } = load('src/main/core/MihomoConfigFactory.ts', { '../utils/logger': { logger } })
const fresh = () => structuredClone(DEFAULT_APP_CONFIG)
const flush = () => new Promise(resolve => setImmediate(resolve))

// Exercise the real pre-ready startup block without starting desktop services.
const startup = fs.readFileSync('src/main/index.ts', 'utf8')
assert.ok(!/appendSwitch\(['"]disable-gpu-compositing['"]/.test(startup),
  'normal startup must not disable GPU compositing: it breaks interactive Windows resizing')
const { renderingSwitches } = load('src/shared/rendering-policy.ts')
assert.ok([false, true].every(lowMemory => renderingSwitches('win32', lowMemory).every(([name]) =>
  !['disable-gpu-compositing', 'disable-gpu', 'disable-gpu-rasterization'].includes(name))),
  'the shared rendering policy must preserve hardware composition in normal mode')
for (const lowMemory of [false, true]) {
  assert.ok(renderingSwitches('win32', lowMemory).some(([name]) => name === 'in-process-gpu'),
    'Windows must not launch a GPU process that creates a second Task Manager group')
  assert.ok(renderingSwitches('win32', lowMemory).some(([name]) => name === 'disable-direct-composition'),
    'in-process GPU needs native presentation without DirectComposition to avoid a gray window')
  for (const platform of ['linux', 'darwin']) {
    assert.ok(!renderingSwitches(platform, lowMemory).some(([name]) => name === 'in-process-gpu'),
      'Windows process grouping must not change other platforms')
  }
}
const startupAst = ts.createSourceFile('index.ts', startup, ts.ScriptTarget.Latest, true)
const graphicsBoot = startupAst.statements.find(statement =>
  ts.isTryStatement(statement) && statement.getText(startupAst).includes('app.disableHardwareAcceleration()'))
assert.ok(graphicsBoot, 'startup configures graphics before app.ready')
for (const [saved, expected] of [
  [null, false], ['{invalid', false], ['{}', false],
  ['null', false],
  [JSON.stringify({ general: { lowMemoryMode: true } }), false],
  [JSON.stringify({ general: { lowMemoryMode: false } }), false],
  [JSON.stringify({ general: { lowMemoryMode: true, disableGpu: false } }), false],
  [JSON.stringify({ general: { lowMemoryMode: false, disableGpu: true } }), true]
]) {
  let disabled = false
  vm.runInNewContext(graphicsBoot.getText(startupAst), {
    app: { getPath: () => 'test', disableHardwareAcceleration: () => { disabled = true } },
    path, lowMemoryMode: false, readFileSync: () => { if (saved === null) throw new Error('ENOENT'); return saved }
  })
  assert.equal(disabled, expected, `GPU startup policy for ${saved}`)
}

function verifyConfiguration() {
  const { resetSettingsSection, mergeSettings, createSettingsSectionPatch } = load('src/shared/settings-config.ts')
  const { createInitialSettings, restoreSettings } = load('src/main/core/SettingsFactory.ts')
  const initial = createInitialSettings(() => 'fixture-unique-secret')
  assert.equal(restoreSettings({ general: { minimizeToTray: false } }, initial).general.closeAction, 'quit', 'legacy close preference is preserved')
  assert.equal(restoreSettings({ general: { minimizeToTray: true } }, initial).general.closeAction, 'tray')
  assert.equal(mergeSettings(initial, { general: { closeAction: 'core-only' } }).general.closeAction, 'core-only')
  assert.throws(() => mergeSettings(initial, { general: { closeAction: 'invalid' } }))
  assert.equal(resetSettingsSection(initial, 'mihomo').kernel.controllerSecret, 'fixture-unique-secret', 'reset preserves authentication identity')
  assert.equal(restoreSettings({}, initial).kernel.controllerSecret, 'fixture-unique-secret', 'legacy settings without secret receive the generated secret')
  assert.equal(restoreSettings({ kernel: { controllerSecret: DEFAULT_APP_CONFIG.kernel.controllerSecret } }, initial).kernel.controllerSecret, 'fixture-unique-secret', 'shared legacy secret is migrated')
  assert.equal(restoreSettings({ kernel: { controllerSecret: 'custom' } }, initial).kernel.controllerSecret, 'custom')
  assert.equal(mergeSettings(initial, { kernel: { tun: { enable: true } } }).kernel.tun.stack, initial.kernel.tun.stack, 'nested patches retain TUN preferences')
  const draft = { form: structuredClone(initial), bypass: ' localhost \r\n\n 10.* ', dnsHijack: ' any:53\n tcp://any:53 ' }
  draft.form.kernel.mixedPort = 1234
  draft.form.kernel.tun.enable = true
  draft.form.sysProxy.enable = true
  const tunPatch = createSettingsSectionPatch('tun', draft, initial)
  assert.equal(tunPatch.kernel.mixedPort, initial.kernel.mixedPort, 'TUN save preserves saved ports')
  assert.deepEqual(tunPatch.kernel.tun.dnsHijack, ['any:53', 'tcp://any:53'])
  const corePatch = createSettingsSectionPatch('mihomo', draft, initial)
  assert.equal(corePatch.kernel.tun.enable, false, 'core save preserves saved capture preference')
  const proxyPatch = createSettingsSectionPatch('sysproxy', draft, initial)
  assert.equal(proxyPatch.sysProxy.enable, false)
  assert.deepEqual(proxyPatch.sysProxy.bypass, ['localhost', '10.*'])
  const config = fresh()
  config.kernel.options = { ipv6: false, 'tcp-concurrent': true, 'unified-delay': true, 'socks-port': 0, 'find-process-mode': 'strict' }
  config.kernel.dns = { enable: true, nameserver: ['1.1.1.1'], 'enhanced-mode': 'fake-ip', 'nameserver-policy': { '+.example.com': '8.8.8.8' } }
  config.kernel.sniffer = { enable: true, sniff: { HTTP: { ports: [80] }, TLS: { ports: [443] } } }
  config.kernel.resources = { profile: { 'store-selected': true }, 'geo-auto-update': false, hosts: { 'test.example': '127.0.0.1' } }
  config.kernel.tun.options = { mtu: 1400, 'auto-detect-interface': true, 'route-exclude-address': ['192.168.0.0/16'] }
  validateAppConfig(config)
  const profile = 'dns:\n  ipv6: true\n  nameserver: [8.8.8.8]\nsniffer:\n  force-domain: [example.com]\nprofile:\n  store-fake-ip: true\nproxies: []\nproxy-groups: []\nrules:\n  - MATCH,DIRECT\n'
  const rendered = yaml.parse(MihomoConfigFactory.synthesize(profile, config))
  assert.equal(rendered.ipv6, false)
  assert.equal(rendered['tcp-concurrent'], true)
  assert.deepEqual(rendered.dns.nameserver, ['1.1.1.1'])
  assert.equal(rendered.dns.ipv6, true, 'unspecified DNS keys inherit subscription values')
  assert.deepEqual(rendered.sniffer['force-domain'], ['example.com'])
  assert.equal(rendered.profile['store-selected'], true)
  assert.equal(rendered.profile['store-fake-ip'], true)
  const logicalPayload = '((DOMAIN,example.com),(NETWORK,tcp))'
  const logical = yaml.parse(MihomoConfigFactory.synthesize(`rules:\n  - AND,${logicalPayload},DIRECT\n  - MATCH,DIRECT\n`, config, [{ type: 'AND', payload: logicalPayload, proxy: 'DIRECT', isDeleted: true }]))
  assert.deepEqual(logical.rules, ['MATCH,DIRECT'], 'logical rule deletion preserves nested comma boundaries')
  config.kernel.dns = null
  assert.deepEqual(yaml.parse(MihomoConfigFactory.synthesize(profile, config)).dns.nameserver, ['8.8.8.8'], 'disabling override restores subscription')
  config.kernel.tun.enable = true
  assert.equal(yaml.parse(MihomoConfigFactory.synthesize(profile, config)).tun.mtu, 1400)
  config.kernel.tun.options['auto-detect-interface'] = false
  assert.equal(yaml.parse(MihomoConfigFactory.synthesize(profile, config)).tun['auto-detect-interface'], false, 'explicit false survives TUN synthesis')
  const base64Sample = 'aHlzdGVyaWEyOi8vbm9kZTE='
  assert.throws(() => MihomoConfigFactory.synthesize(base64Sample, config), /Profile must contain/, 'invalid profiles must never silently enable direct routing')
  const invalid = fresh()
  invalid.kernel.options = { 'socks-port': 70000 }
  assert.throws(() => validateAppConfig(invalid), /invalid value/)
  invalid.kernel.options = { 'external-controller': '0.0.0.0:8080' }
  assert.throws(() => validateAppConfig(invalid), /unsupported setting/)
  invalid.kernel.options = { port: invalid.kernel.mixedPort }
  assert.throws(() => validateAppConfig(invalid), /unique/)
  invalid.kernel.options = {}
  invalid.general.shortcuts = { showWindow: 'Ctrl+Q', tun: 'ctrl+q' }
  assert.throws(() => validateAppConfig(invalid), /unique/)
  invalid.general.shortcuts = { showWindow: 'Control+Shift+Q', tun: 'Shift+Ctrl+q' }
  assert.throws(() => validateAppConfig(invalid), /unique/, 'modifier aliases and order cannot hide duplicates')
  const dir = path.resolve('artifacts/settings-check')
  fs.mkdirSync(dir, { recursive: true })
  const filename = path.join(dir, 'config.yaml')
  config.kernel.tun.enable = false
  fs.writeFileSync(filename, MihomoConfigFactory.synthesize(profile, config))
  execFileSync(path.resolve('extra/sidecar/mihomo.exe'), ['-t', '-d', dir, '-f', filename], { windowsHide: true, timeout: 15000, stdio: 'pipe' })
}

async function verifyPac() {
  const config = fresh(), commands = []
  config.sysProxy.mode = 'pac'
  const { SysProxyService } = load('src/main/services/SysProxyService.ts', {
    '../utils/windows-proxy': { WindowsProxySettings: class {
      async capture() {}
      async restore() {}
      async set(...args) { commands.push(args) }
    } },
    '../utils/logger': { logger }
  }, { process: { platform: 'win32' } })
  const service = new SysProxyService({ getSettings: () => config, updateSettings: async patch => Object.assign(config, patch) })
  await service.setCoreRunning(true)
  try {
    await service.setSysProxy(true)
    const url = commands.find(args => args[0] === 'AutoConfigURL')[1]
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/proxy\.pac$/)
    const response = await fetch(url)
    assert.equal(response.status, 200)
    const script = await response.text()
    const context = { isPlainHostName: host => !host.includes('.'), shExpMatch: (host, pattern) => pattern === '127.*' && host.startsWith('127.') }
    vm.runInNewContext(script + ';this.find = FindProxyForURL', context)
    assert.equal(context.find('http://printer', 'printer'), 'DIRECT')
    assert.equal(context.find('http://127.0.0.1', '127.0.0.1'), 'DIRECT')
    assert.match(context.find('https://example.com', 'example.com'), /PROXY 127.0.0.1:7895/)
    config.sysProxy.pacScript = 'invalid {'
    const count = commands.length
    await assert.rejects(service.setSysProxy(true))
    assert.equal(commands.length, count, 'bad PAC scripts cannot change OS settings')
    config.sysProxy.pacScript = ''
    await service.dispose()
    assert.equal(config.sysProxy.enable, true, 'shutdown restores OS state without erasing the user preference')
    assert.equal(service.getStatus().enabled, false)
  } finally { await service.dispose() }
}

async function verifyDesktop() {
  const config = fresh(), bindings = new Map(), timers = new Set(), login = [], calls = []
  config.general.autoStart = true
  config.general.autoUpdateProfiles = true
  config.general.shortcuts = { showWindow: 'Ctrl+Alt+Q', globalMode: 'Ctrl+Alt+G' }
  const { DesktopService } = load('src/main/services/DesktopService.ts', {
    electron: { app: { isPackaged: true, setLoginItemSettings: options => login.push(options.openAtLogin) }, globalShortcut: { register: (key, fn) => { if (key === 'Taken') return false; bindings.set(key, fn); return true }, unregister: key => bindings.delete(key) } },
    '../utils/logger': { logger },
    '../utils/elevation': { isProcessElevated: () => true },
    '../utils/windows-startup': { applyWindowsStartup: async general => login.push(general.autoStart) }
  }, { process: { platform: 'win32' }, setTimeout: (fn, ms) => { const timer = { fn, ms, unref() {} }; timers.add(timer); return timer }, clearTimeout: timer => timers.delete(timer) })
  const { NetworkModeController } = load('src/main/services/NetworkModeController.ts', { '../utils/elevation': { isProcessElevated: () => true }, '../utils/logger': { logger } })
  const desktopArgs = [
    { getSettings: () => structuredClone(config), updateSettings: async patch => { Object.assign(config, patch); calls.push('save'); return structuredClone(config) } },
    { getProfiles: () => [{ id: 'active', type: 'remote' }, { id: 'other', type: 'remote' }, { id: 'local', type: 'local' }, { id: 'disabled', type: 'remote', autoUpdate: false }, { id: 'recent', type: 'remote', interval: 15, updatedAt: Date.now() }], getActiveProfile: () => ({ id: 'active' }), updateProfile: async id => { calls.push('update:' + id); return true } },
    { getStatus: () => 'running', restart: async () => calls.push('restart'), patchConfigs: async patch => calls.push('mode:' + patch.mode) },
    { getStatus: () => ({ enabled: config.sysProxy.enable }), setSysProxy: async enable => { config.sysProxy.enable = enable; calls.push('proxy:' + enable) } }, { show: () => calls.push('show') }, () => calls.push('notify')]
  const desktop = new DesktopService(...desktopArgs, new NetworkModeController(desktopArgs[0], desktopArgs[2], desktopArgs[3], async () => {}, () => {}, () => true))
  await desktop.initialize()
  assert.deepEqual(login, [true])
  const previousShow = bindings.get('Ctrl+Alt+Q')
  desktop.setShortcutRecording(true)
  assert.equal(desktop.isShortcutRecording(), true)
  assert.equal(bindings.size, 0, 'global combinations reach the recorder while editing')
  previousShow()
  assert.equal(calls.length, 0, 'stale callbacks cannot execute during recording')
  desktop.setShortcutRecording(false)
  assert.equal(desktop.isShortcutRecording(), false)
  assert.equal(bindings.size, 2, 'recording completion restores registered actions')
  bindings.get('Ctrl+Alt+Q')()
  assert.equal(calls.at(-1), 'show')
  bindings.get('Ctrl+Alt+G')()
  await flush()
  assert.deepEqual(calls.slice(-3), ['mode:global', 'save', 'notify'])
  const invalid = fresh()
  invalid.general.shortcuts = { showWindow: 'Taken' }
  await assert.rejects(() => desktop.applySettings(invalid), /unavailable/)
  assert.equal(bindings.has('Ctrl+Alt+Q'), true, 'failed registration restores existing shortcuts')
  const scheduled = [...timers][0]
  assert.equal(scheduled.ms, 15 * 60_000, 'scheduler wakes for the shortest per-profile interval')
  scheduled.fn()
  await flush()
  assert.equal(calls.filter(call => call === 'restart').length, 1, 'all background profile updates apply through one restart')
  assert.ok(!calls.includes('update:local'))
  assert.ok(!calls.includes('update:disabled'), 'disabled subscriptions are skipped')
  assert.ok(!calls.includes('update:recent'), 'subscriptions are not fetched before their interval elapses')
  await desktop.dispose()
  assert.equal(bindings.size, 0)
  assert.equal(timers.size, 0)
  await desktop.initialize()
  assert.equal(bindings.size, 2, 'resuming after cancelled elevation restores shortcuts')
  assert.equal(timers.size, 1, 'resuming after cancelled elevation restores profile updates')
  config.general.shortcuts = { showWindow: 'Ctrl+Alt+Q', sysProxy: 'Ctrl+Alt+P', tun: 'Ctrl+Alt+T', ruleMode: 'Ctrl+Alt+R', globalMode: 'Ctrl+Alt+G', directMode: 'Ctrl+Alt+D' }
  await desktop.applySettings(config)
  assert.equal(bindings.size, 6, 'every recorder action has a global registration')
  for (const [key, mode] of [['Ctrl+Alt+R', 'rule'], ['Ctrl+Alt+D', 'direct']]) {
    bindings.get(key)()
    await flush()
    assert.equal(config.kernel.mode, mode)
    assert.ok(calls.includes('mode:' + mode))
  }
  bindings.get('Ctrl+Alt+P')()
  await flush()
  assert.equal(config.sysProxy.enable, true)
  bindings.get('Ctrl+Alt+T')()
  await flush()
  assert.equal(config.kernel.tun.enable, true)
  assert.equal(config.sysProxy.enable, false, 'TUN shortcut disables the conflicting system proxy')
  await desktop.dispose()
  config.general.autoUpdateProfiles = false
  config.general.updateProfilesOnStart = true
  config.general.profileStartupMaxAgeHours = 24
  calls.length = 0
  const startupDesktop = new DesktopService(...desktopArgs, {})
  await startupDesktop.initialize()
  await flush()
  assert.ok(calls.includes('update:active'), 'stale subscriptions update at startup even when periodic updates are off')
  assert.ok(!calls.includes('update:recent'), 'fresh subscriptions are skipped at startup')
  assert.ok(!calls.includes('update:disabled'))
  assert.equal(calls.filter(call => call === 'restart').length, 1, 'startup updates restart the active core once')
  await startupDesktop.dispose()
  assert.equal(timers.size, 0)
}

function verifySession() {
  let time = 10000
  const manager = new EventEmitter()
  const api = new EventEmitter()
  Object.assign(api, { startTrafficStream() {}, startLogStream() {}, stopAllStreams() {} })
  const { KernelService } = load('src/main/services/KernelService.ts', {
    '../utils/elevation': { isProcessElevated: () => false },
    '../utils/logger': { logger }
  }, { Date: class extends Date { static now() { return time } } })
  const kernel = new KernelService({ getSettings: fresh }, {}, {
    processManager: manager, apiClient: api, geoIp: {}, configBuilder: {}, trafficAccounting: {}
  })
  const messages = []
  kernel.setBroadcaster((channel, data) => messages.push({ channel, data }))
  const entry = { type: 'info', payload: 'Ready', time: '12:00:00' }
  manager.emit('log', entry)
  api.emit('log', entry)
  assert.deepEqual(messages.map(message => message.channel), ['event:log'], 'process logs use the preload channel without duplicating API logs')
  assert.equal(kernel.getSessionStartedAt(), null)
  manager.emit('state-change', 'running')
  assert.equal(kernel.getSessionStartedAt(), 10000)
  manager.emit('state-change', 'stopped')
  assert.equal(kernel.getSessionStartedAt(), null)
  time = 20000
  manager.emit('state-change', 'running')
  assert.equal(kernel.getSessionStartedAt(), 20000)
  const { formatDuration } = load('src/renderer/src/lib/format.ts')
  assert.equal(formatDuration(3661000), '01:01:01')
  assert.equal(formatDuration(25 * 3600000), '25:00:00')
  assert.equal(formatDuration(-100), '00:00:00')
}

async function verifyMigration() {
  const { SettingService } = load('src/main/services/SettingService.ts', {
    fs: { promises: { readFile: async () => JSON.stringify({ general: { language: 'en' }, kernel: { tun: { enable: true, stack: 'mixed' } } }), writeFile: async () => {} } },
    '../utils/paths': { getAppPaths: () => ({ settingsFilePath: 'fixture-settings.json' }) }, '../utils/logger': { logger }
  })
  const settings = new SettingService()
  await settings.initialize()
  assert.equal(settings.getSettings().general.language, 'en')
  assert.equal(settings.getSettings().general.connectionInterval, 2000)
  assert.equal(settings.getSettings().kernel.tun.enable, true)
  assert.deepEqual(settings.getSettings().kernel.tun.dnsHijack, ['any:53'])
  await settings.updateSettings({ kernel: { tun: { options: { mtu: 1450 } } } })
  assert.equal(settings.getSettings().kernel.tun.stack, 'mixed', 'partial TUN updates preserve existing fields')
  assert.equal(settings.getSettings().kernel.tun.options.mtu, 1450)
  await assert.rejects(settings.updateSettings({ kernel: { options: { port: 99999 } } }))
  assert.equal(settings.getSettings().kernel.tun.options.mtu, 1450, 'rejected settings do not replace the valid config')
  const snapshot = settings.getSettings()
  snapshot.kernel.tun.stack = 'system'
  assert.equal(settings.getSettings().kernel.tun.stack, 'mixed', 'callers cannot mutate saved settings through a returned snapshot')
  const pack = { id: 'custom', name: 'Custom', locale: 'de', baseLanguage: 'en', messages: { native: { quit: 'Beenden' } } }
  await settings.updateSettings({ general: { customLocalizations: [pack], customLocalization: pack.id } })
  assert.deepEqual(settings.getSettings().general.customLocalizations, [pack])
  assert.equal(settings.getSettings().general.customLocalization, pack.id)
  const { nativeMessages } = load('src/shared/localization.ts')
  assert.equal(nativeMessages(settings.getSettings().general).quit, 'Beenden')
  assert.equal(nativeMessages(settings.getSettings().general).open, 'Open home')
  await assert.rejects(settings.updateSettings({ general: { customLocalizations: [pack, pack] } }))
  await assert.rejects(settings.updateSettings({ general: { customLocalization: 'missing' } }))
  await assert.rejects(settings.updateSettings({ general: { customLocalizations: [{ ...pack, locale: '!bad' }] } }))
  assert.equal(settings.getSettings().general.autoReleaseWindow, false, 'automatic release is opt-in after migration')
  await settings.updateSettings({ general: { autoReleaseWindow: true, autoReleaseWindowMinutes: 7 } })
  assert.equal(settings.getSettings().general.autoReleaseWindowMinutes, 7)
  for (const minutes of [0, -1, 1441, 1.5, NaN]) {
    await assert.rejects(settings.updateSettings({ general: { autoReleaseWindowMinutes: minutes } }))
  }
}

function verifyWindowKeys() {
  for (const dev of [false, true]) {
    const { watchWindowShortcuts } = load('src/main/utils/window-shortcuts.ts', { '@electron-toolkit/utils': { is: { dev } } })
    let recording = false, opened = false
    const webContents = Object.assign(new EventEmitter(), {
      setIgnoreMenuShortcuts: () => {},
      isDevToolsOpened: () => opened, openDevTools: () => { opened = true }, closeDevTools: () => { opened = false }
    })
    watchWindowShortcuts({ webContents }, () => recording)
    const press = code => {
      let prevented = false
      webContents.emit('before-input-event', { preventDefault: () => { prevented = true } }, { type: 'keyDown', code, control: true, shift: true })
      return prevented
    }
    assert.equal(press('KeyR'), !dev, 'production reload guard stays active outside recording')
    assert.equal(press('Minus'), true)
    recording = true
    for (const code of ['KeyR', 'KeyI', 'Minus', 'Equal', 'F12']) assert.equal(press(code), false, 'recording receives native key combinations')
    assert.equal(opened, false, 'recording F12 does not open devtools')
  }
}

Promise.resolve().then(verifyConfiguration).then(verifyPac).then(verifyDesktop).then(verifyWindowKeys).then(verifySession).then(verifyMigration).then(() => console.log('PASS: settings validation/migration/inheritance, real Mihomo config, PAC server, startup/shortcuts/update scheduling, native key recording, session clock')).catch(err => { console.error(err); process.exitCode = 1 })
