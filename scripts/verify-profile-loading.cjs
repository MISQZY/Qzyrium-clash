const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { setImmediate: nextTurn } = require('node:timers/promises')

function load(file, dependencies, runtime = process) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const exports = {}
  vm.runInThisContext(`(function(exports, require, process) {\n${output}\n})`, { filename: file })(
    exports, name => {
      if (dependencies[name]) return dependencies[name]
      if (name === '../utils/atomicWrite' && dependencies.fs) return { writeFileAtomicAsync: (...args) => dependencies.fs.promises.writeFile(...args) }
      if (name === '../utils/profile-validator') return { validateProfileContent: async () => {} }
    if (name.endsWith('.json') && name.startsWith('.')) return require(path.resolve(path.dirname(file), name))
      const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts') : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
      return target && fs.existsSync(target) ? load(target, {}) : require(name)
    }, runtime
  )
  return exports
}

const logger = { info() {}, warn() {}, error() {}, debug() {} }
const { subscriptionName } = load('src/main/utils/subscription-name.ts', {})

function verifySubscriptionNames() {
  const name = '🇳🇱 Европа 🚀'
  assert.equal(subscriptionName({ 'profile-title': `base64:${Buffer.from(name).toString('base64')}` }), name)
  assert.equal(subscriptionName({ 'profile-title': Buffer.from(name).toString('latin1') }), name)
  assert.equal(subscriptionName({ 'profile-title': 'Manual ASCII', 'content-disposition': 'attachment; filename="other.yaml"' }), 'Manual ASCII')
  assert.equal(subscriptionName({ 'content-disposition': `attachment; filename="fallback.yaml"; filename*=UTF-8''${encodeURIComponent(name)}.yaml` }), name)
  assert.equal(subscriptionName({ 'profile-title': 'base64:!!!', 'content-disposition': 'attachment; filename="Fallback.yaml"' }), 'Fallback')
  assert.equal(subscriptionName({ 'profile-title': 'base64:/w==', 'content-disposition': "attachment; filename*=UTF-8''%zz" }), undefined)
  assert.equal(subscriptionName(undefined), undefined)
  assert.equal(subscriptionName({}, 'name: "🇳🇱 Test"\nproxies: []'), '🇳🇱 Test')
  assert.equal(subscriptionName({}, `# profile-title: base64:${Buffer.from(name).toString('base64')}\nproxies: []`), name)
  assert.equal(subscriptionName({}, 'proxies:\n  - name: Node name'), undefined, 'node names are not subscription titles')
  const { emojiParts, emojiAsset, flagCode, countryFlag } = load('src/renderer/src/lib/emoji.ts', {})
  const sample = 'Host 🇳🇱 👩🏽‍💻 1️⃣ ❤️'
  const parts = emojiParts(sample)
  assert.equal(parts.map(part => part.text).join(''), sample, 'original name must survive emoji segmentation')
  assert.deepEqual(parts.filter(part => part.emoji).map(part => part.text), ['🇳🇱', '👩🏽‍💻', '1️⃣', '❤️'])
  assert.equal(flagCode('🇳🇱'), 'NL')
  assert.equal(countryFlag('nl'), '🇳🇱')
  assert.equal(countryFlag(''), '')
  assert.equal(countryFlag('not-a-country'), '')
  assert.ok(emojiAsset('👩🏽‍💻').endsWith('/1f469-1f3fd-200d-1f4bb.svg'))
  assert.ok(emojiAsset('❤️').endsWith('/2764.svg'))
}

function verifyClashUrls() {
  const { parseSubscriptionImportUrl, buildClashImportUrl, buildQzyriumImportUrl } = load('src/shared/clash-url.ts', {})
  const clashLink = 'clash://install-config?url=' + encodeURIComponent('https://provider.example.com/api/v1/sub?token=123') + '&name=' + encodeURIComponent('My Proxy Server')
  const parsedClash = parseSubscriptionImportUrl(clashLink)
  assert.equal(parsedClash.url, 'https://provider.example.com/api/v1/sub?token=123')
  assert.equal(parsedClash.name, 'My Proxy Server')

  const qzyriumLink = 'qzyrium://install-config?url=' + encodeURIComponent('https://provider.example.com/sub2')
  const parsedQz = parseSubscriptionImportUrl(qzyriumLink)
  assert.equal(parsedQz.url, 'https://provider.example.com/sub2')
  assert.equal(parsedQz.name, undefined)

  const plain = parseSubscriptionImportUrl('https://plain.example.com/sub')
  assert.equal(plain.url, 'https://plain.example.com/sub')

  const built = buildClashImportUrl('https://example.com/sub', 'Test')
  assert.equal(built, 'clash://install-config?url=https%3A%2F%2Fexample.com%2Fsub&name=Test')
  const encodedUrl = 'https://example.com/sub?token=a%2Bb%26c&path=%2Fprivate'
  for (const build of [buildClashImportUrl, buildQzyriumImportUrl]) {
    assert.deepEqual(parseSubscriptionImportUrl(build(encodedUrl, '100% test')), { url: encodedUrl, name: '100% test' }, 'URI parsing decodes its wrapper exactly once')
  }
}

async function verifySettings() {
  const defaults = structuredClone(load('src/shared/app-config.ts', {}).DEFAULT_APP_CONFIG)
  const { subscriptionUserAgent } = load('src/shared/app-config.ts', {})
  assert.equal(defaults.general.userAgent, 'clash.meta/qzyrium')
  for (const value of [undefined, '', 'qzyriumvpn', 'clash.meta', 'clash.meta / QzyriumVPN', 'clash.meta / Qzyrium - clash']) {
    assert.equal(subscriptionUserAgent(value), 'clash.meta/qzyrium', 'legacy/default subscription agents migrate')
  }
  assert.equal(subscriptionUserAgent('My custom client'), 'My custom client')
  const writes = []
  let releaseFirstWrite, failNext = false, activeWrites = 0, maxActiveWrites = 0, saved
  const firstWrite = new Promise(resolve => { releaseFirstWrite = resolve })
  const { SettingService } = load('src/main/services/SettingService.ts', {
    fs: { promises: {
      async readFile() { return JSON.stringify({ ...defaults, general: { ...defaults.general, userAgent: 'clash.meta / QzyriumVPN' } }) },
      async writeFile(file, value) {
        assert.equal(file, 'settings.json')
        writes.push(JSON.parse(value))
        maxActiveWrites = Math.max(maxActiveWrites, ++activeWrites)
        const shouldFail = failNext
        failNext = false
        try {
          if (writes.length === 1) await firstWrite
          await nextTurn()
          if (shouldFail) throw new Error('disk unavailable')
          saved = JSON.parse(value)
        } finally { activeWrites-- }
      }
    } },
    '@shared/app-config': { DEFAULT_APP_CONFIG: defaults, subscriptionUserAgent },
    '../utils/paths': { getAppPaths: () => ({ settingsFilePath: 'settings.json' }) },
    '../utils/logger': { logger }
  })
  const settings = new SettingService()
  await settings.initialize()
  assert.equal(settings.getSettings().general.userAgent, 'clash.meta/qzyrium', 'saved legacy settings migrate on load')
  const first = settings.updateSettings({ general: { theme: 'light' } })
  await Promise.resolve()
  const second = settings.updateSettings({ kernel: { mode: 'global' } })
  await Promise.resolve()
  assert.equal(writes.length, 1, 'later settings writes must wait for the active disk write')
  releaseFirstWrite()
  await Promise.all([first, second])
  assert.deepEqual(writes.map(value => [value.general.theme, value.kernel.mode]), [['light', 'rule'], ['light', 'global']])
  assert.equal(saved.kernel.mode, 'global', 'last settings snapshot must remain on disk')
  failNext = true
  const failed = settings.updateSettings({ general: { theme: 'dark' } })
  const recovery = settings.updateSettings({ kernel: { mode: 'direct' } })
  await assert.rejects(failed, /disk unavailable/, 'disk failures must reach the caller')
  await recovery
  assert.equal(saved.general.theme, 'light', 'a failed write must not publish or leak its settings into the next update')
  assert.equal(saved.kernel.mode, 'direct', 'a failed settings write must not poison later queued saves')
  assert.equal(maxActiveWrites, 1, 'settings disk writes must never overlap')
  await settings.dispose()
}

async function verifyProfiles() {
  const files = new Map([
    ['profiles.json', JSON.stringify([
      { id: 'a', name: 'Active', type: 'remote', url: 'https://fixture/a', updatedAt: 1 },
      { id: 'b', name: 'Other', type: 'remote', url: 'https://fixture/b', updatedAt: 1 }
    ])],
    [path.resolve('profiles', 'a.yaml'), 'old'], [path.resolve('profiles', 'b.yaml'), 'old']
  ])
  let metadataWrites = 0, maxMetadataWrites = 0, fetches = 0, content = 'new', failFetch = false, responseHeaders = {}
  const requestAgents = []
  const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' })
  const { ProfileService } = load('src/main/services/ProfileService.ts', {
    fs: { promises: {
      async readFile(file) { if (!files.has(file)) throw missing(); return files.get(file) },
      async writeFile(file, value) {
        if (file === 'profiles.json') maxMetadataWrites = Math.max(maxMetadataWrites, ++metadataWrites)
        await nextTurn()
        files.set(file, value)
        if (file === 'profiles.json') metadataWrites--
      },
      async unlink(file) { files.delete(file) }
    } },
    axios: { async get(_url, options) { requestAgents.push(options.headers['User-Agent']); fetches++; await nextTurn(); if (failFetch) throw new Error('download failed'); return { data: content, headers: responseHeaders } } },
    '../utils/subscription-name': { subscriptionName },
    '../utils/paths': { getAppPaths: () => ({ profilesFilePath: 'profiles.json', profilesDir: 'profiles' }) },
    '../utils/logger': { logger }
  })
  const profiles = new ProfileService()
  await profiles.initialize()
  const rules = [{ type: 'DOMAIN', payload: 'example.com', proxy: 'DIRECT' }]
  await Promise.all([profiles.saveCustomRules('a', rules), profiles.saveCustomRules('b', rules)])
  assert.equal(maxMetadataWrites, 1, 'metadata saves must never overlap')
  assert.equal(JSON.parse(files.get('profiles.json'))[1].customRules.length, 1, 'latest metadata must survive concurrent saves')
  assert.equal(await profiles.saveCustomRules('a', structuredClone(rules)), false, 'unchanged rules need no rewrite')
  failFetch = true
  const failedUpdate = profiles.updateProfile('a')
  assert.equal(profiles.updateProfile('a'), failedUpdate, 'service consumers must share pending updates too')
  await assert.rejects(failedUpdate, /download failed/)
  failFetch = false
  fetches = 0

  const handlers = new Map()
  let restarts = 0, status = 'running'
  const { registerIpcHandlers } = load('src/main/ipc/registerHandlers.ts', {
    '../utils/elevation': { isProcessElevated: () => false, restartAsAdmin: async () => false },
    electron: {
      ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) },
      app: { getVersion: () => '1.0.0', getFileIcon: async () => null },
      shell: { openExternal: async () => {} }
    },
    '@shared/ipc': { IPC_CHANNELS: new Proxy({}, { get: (_, key) => key }) },
    '../utils/logger': { logger }
  })
  registerIpcHandlers({ profileService: profiles, kernelService: {
    getStatus: () => status, async restart() { restarts++; await nextTurn() }
  } })
  const invoke = (channel, ...args) => handlers.get(channel)(null, ...args)
  const first = invoke('PROFILE_UPDATE', 'a')
  await Promise.all([first, invoke('PROFILE_UPDATE', 'a'), invoke('PROFILE_UPDATE', 'a')])
  assert.equal(fetches, 1, 'concurrent subscription updates must share one download')
  assert.equal(restarts, 1, 'shared subscription update must restart only once')
  await invoke('PROFILE_UPDATE', 'a')
  assert.equal(restarts, 1, 'unchanged subscription must not restart')
  await invoke('PROFILE_UPDATE', 'b')
  assert.equal(restarts, 1, 'inactive subscription update must not restart')
  await invoke('PROFILE_SAVE_RAW_CONFIG', 'a', 'new')
  await invoke('PROFILE_SAVE_CUSTOM_RULES', 'a', structuredClone(rules))
  await invoke('PROFILE_SET_ACTIVE', 'a')
  assert.equal(restarts, 1, 'unchanged content, rules and selection must not restart')
  const added = await invoke('PROFILE_ADD', { name: 'Local', type: 'local', content: 'local' })
  assert.equal(profiles.getActiveProfile().id, 'a', 'adding a profile must preserve the active profile')
  await invoke('PROFILE_DELETE', added.id)
  assert.equal(restarts, 1, 'adding/deleting inactive profiles must not restart')
  status = 'stopped'
  content = 'updated while stopped'
  responseHeaders = {
    'profile-logo': 'https://example.com/logo.png',
    announce: 'base64:' + Buffer.from('Привет мир').toString('base64'),
    'support-url': 'https://example.com/support'
  }
  await invoke('PROFILE_UPDATE', 'a')
  const updatedA = profiles.getActiveProfile()
  assert.equal(updatedA.profileLogo, 'https://example.com/logo.png', 'profile-logo header must be parsed and stored')
  assert.equal(updatedA.announce, 'Привет мир', 'announce header must be decoded and stored')
  assert.equal(updatedA.supportUrl, 'https://example.com/support', 'support-url header must be parsed and stored')
  assert.equal(restarts, 1, 'profile updates must not start a stopped core')
  responseHeaders = { 'profile-title': `base64:${Buffer.from('🚀 Provider').toString('base64')}` }
  const automatic = await profiles.addProfile({ type: 'remote', url: 'https://fixture/automatic' })
  assert.equal(automatic.name, '🚀 Provider')
  assert.equal(automatic.nameSource, 'subscription')
  const manual = await profiles.addProfile({ type: 'remote', url: 'https://fixture/manual', name: '  My name  ' })
  assert.equal(manual.name, 'My name')
  responseHeaders = {}
  const fallback = await profiles.addProfile({ type: 'remote', url: 'https://fixture/fallback', name: '   ' })
  assert.equal(fallback.nameSource, 'fallback')
  assert.ok(fallback.name.trim())
  responseHeaders = { 'profile-title': 'New provider name' }
  assert.equal(await profiles.updateProfile(fallback.id), false, 'name-only updates do not require a restart')
  assert.equal(fallback.name, 'New provider name')
  assert.equal(fallback.nameSource, 'subscription')
  await profiles.updateProfile(automatic.id)
  assert.equal(automatic.name, 'New provider name')
  await profiles.updateProfile(manual.id)
  assert.equal(manual.name, 'My name', 'provider cannot replace a manual name')
  await profiles.updateProfile('a')
  assert.equal(profiles.getProfiles().find(item => item.id === 'a').name, 'Active', 'legacy names remain unchanged')
  assert.ok(requestAgents.length > 0 && requestAgents.every(agent => agent === 'clash.meta/qzyrium'), 'subscription imports and updates send the new User-Agent')
  profiles.getProfiles().find(item => item.id === 'a').customUA = 'Custom profile client'
  await profiles.updateProfile('a')
  assert.equal(requestAgents.at(-1), 'Custom profile client', 'explicit per-profile User-Agent is preserved')
  await profiles.dispose()
}

async function verifySystemProxy() {
  const commands = []
  let activeCommands = 0, maxActiveCommands = 0
  const settings = { kernel: { mixedPort: 7895 }, sysProxy: { enable: false, bypass: ['localhost'] } }
  const { SysProxyService } = load('src/main/services/SysProxyService.ts', {
    child_process: { execFile(file, args, options, callback) {
      assert.equal(file, 'reg.exe')
      assert.equal(options.windowsHide, true)
      commands.push(args[3])
      maxActiveCommands = Math.max(maxActiveCommands, ++activeCommands)
      setImmediate(() => { activeCommands--; callback(null, '', '') })
    } }, '../utils/logger': { logger }
  }, { platform: 'win32' })
  const proxy = new SysProxyService({ getSettings: () => settings, async updateSettings(patch) { Object.assign(settings, patch) } })
  const handlers = new Map()
  const { registerIpcHandlers } = load('src/main/ipc/registerHandlers.ts', {
    '../utils/elevation': { isProcessElevated: () => false, restartAsAdmin: async () => false },
    electron: { ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) } },
    '@shared/ipc': { IPC_CHANNELS: new Proxy({}, { get: (_, key) => key }) },
    '../utils/logger': { logger }
  })
  registerIpcHandlers({ sysProxyService: proxy })
  await proxy.setCoreRunning(true)
  const enabling = proxy.setSysProxy(true)
  let statusRead = false
  const initialRead = handlers.get('SYSPROXY_GET_STATUS')().then(status => { statusRead = true; return status })
  await Promise.resolve()
  assert.equal(statusRead, false, 'initial status read must wait for proxy restoration')
  assert.equal((await initialRead).enabled, true)
  await enabling
  const reenable = proxy.setSysProxy(true)
  await Promise.all([reenable, proxy.setSysProxy(false)])
  assert.equal(maxActiveCommands, 1, 'concurrent toggles must preserve registry command order')
  assert.deepEqual(commands, ['AutoConfigURL', 'ProxyServer', 'ProxyOverride', 'ProxyEnable', 'AutoConfigURL', 'ProxyServer', 'ProxyOverride', 'ProxyEnable', 'AutoConfigURL', 'ProxyEnable'])
  assert.equal(proxy.getStatus().enabled, false, 'last toggle must determine final state')
}

Promise.resolve().then(verifySubscriptionNames).then(verifyClashUrls).then(verifySettings).then(verifyProfiles).then(verifySystemProxy).then(() => console.log('PASS: subscription names/Unicode/headers/fallback, serialized IO, subscription dedupe, conditional restarts and async proxy ordering')).catch(error => {
  console.error(error)
  process.exitCode = 1
})
