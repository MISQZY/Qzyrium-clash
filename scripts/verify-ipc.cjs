const assert = require('node:assert/strict')
const { createIpcFixture } = require('./fixtures/ipc.cjs')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')

function verifyTrustedRegistration() {
  const fixture = createIpcFixture()
  const callbacks = new Map()
  let currentWindow = fixture.windowService.getMainWindow(), calls = 0
  const { createTrustedRegistrar } = load('src/main/ipc/trusted-handler.ts')
  const handle = createTrustedRegistrar({ handle: (channel, callback) => callbacks.set(channel, callback) }, {
    getMainWindow: () => currentWindow, getRendererUrl: fixture.windowService.getRendererUrl
  })
  handle('app:copy-to-clipboard', (_event, value) => { calls++; return value })
  const invoke = event => callbacks.get('app:copy-to-clipboard')(event, '123')
  assert.equal(invoke(fixture.event), '123')
  assert.equal(calls, 1)
  for (const event of [
    { ...fixture.event, sender: {} },
    { ...fixture.event, senderFrame: null },
    { ...fixture.event, senderFrame: { url: fixture.event.senderFrame.url } }
  ]) assert.throws(() => invoke(event), /Untrusted IPC sender/)
  const frame = fixture.event.senderFrame
  const original = frame.url
  for (const url of ['https://attacker.example/', 'file:///fixture/renderer/other.html',
    `${original}.evil`, 'about:blank', 'invalid']) {
    frame.url = url
    assert.throws(() => invoke(fixture.event), /Untrusted IPC sender/)
  }
  frame.url = `${original}?view=settings#tab`
  assert.equal(invoke(fixture.event), '123', 'same document may use query/hash navigation')
  frame.url = original
  const oldWindow = currentWindow
  currentWindow = null
  assert.throws(() => invoke(fixture.event), /Untrusted IPC sender/)
  currentWindow = { ...oldWindow, isDestroyed: () => true }
  assert.throws(() => invoke(fixture.event), /Untrusted IPC sender/)
  currentWindow = { ...oldWindow, webContents: { ...oldWindow.webContents, isDestroyed: () => true } }
  assert.throws(() => invoke(fixture.event), /Untrusted IPC sender/)
  const replacement = createIpcFixture()
  currentWindow = replacement.windowService.getMainWindow()
  assert.throws(() => invoke(fixture.event), /Untrusted IPC sender/, 'old window loses access')
  assert.equal(invoke(replacement.event), '123')
  assert.equal(calls, 3, 'rejected senders never reach the command')
  assert.throws(() => callbacks.get('app:copy-to-clipboard')(replacement.event, { secret: 'never-log-me' }),
    error => /Invalid IPC arguments/.test(error.message) && !error.message.includes('never-log-me'))
  assert.equal(calls, 3, 'invalid arguments from a trusted sender do not execute the command')
}

function verifyAllChannelsProtected() {
  const handlers = new Map()
  const fixture = createIpcFixture()
  const { IPC_CHANNELS } = load('src/shared/ipc.ts')
  const { registerIpcHandlers } = load('src/main/ipc/registerHandlers.ts', {
    electron: { ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) } },
    '../utils/logger': { logger: { info() {} } },
    '../utils/elevation': {}, '../utils/restart-state': {}
  })
  // A rejected invocation must not even look up another service.
  registerIpcHandlers(new Proxy({ windowService: fixture.windowService }, {
    get(target, key) {
      if (key in target) return target[key]
      throw new Error(`Unexpected service access: ${String(key)}`)
    }
  }))
  for (const channel of Object.values(IPC_CHANNELS).filter(channel => !channel.startsWith('event:'))) {
    assert.ok(handlers.has(channel), `registered: ${channel}`)
    assert.throws(() => handlers.get(channel)({ ...fixture.event, sender: {} }), /Untrusted IPC sender/, channel)
  }
}

function verifyArgumentContracts() {
  const { validateIpcArguments: validate } = load('src/main/ipc/argument-validation.ts')
  const { IPC_CHANNELS } = load('src/shared/ipc.ts')
  const defaults = load('src/shared/app-config.ts').DEFAULT_APP_CONFIG
  const rule = { id: 'rule-1', type: 'DOMAIN', payload: 'example.com', proxy: 'DIRECT',
    sourceRule: 'DOMAIN,example.com,DIRECT', sourceOccurrence: 0, offset: 0, enabled: false }
  const examples = {
    'mihomo:patch-configs': [{ mode: 'rule', dns: { nameserver: ['https://dns.example/'] } }],
    'mihomo:select-proxy': ['Group', 'Node'],
    'mihomo:test-delay': ['Node', 'https://example.com/', 5000],
    'mihomo:get-rules': ['summary'], 'mihomo:close-connection': ['connection-1'],
    'profile:set-active': ['profile-1'], 'profile:delete': ['profile-1'], 'profile:update': ['profile-1'],
    'profile:get-custom-rules': ['profile-1'], 'profile:save-custom-rules': ['profile-1', [rule]],
    'profile:validate-custom-rules': ['profile-1', [rule]], 'profile:get-raw-config': ['profile-1'],
    'profile:save-raw-config': ['profile-1', ''],
    'profile:update-info': ['profile-1', { name: '', url: '', interval: 15, autoUpdate: false, customUA: undefined }],
    'profile:add': [{ type: 'remote', url: 'https://example.com/sub', updateViaProxy: true }],
    'sysproxy:set': [false], 'app:update-settings': [defaults], 'app:set-shortcut-recording': [false],
    'app:open-folder': ['logs'], 'theme:save-custom-theme': [{ id: 'theme-1', name: 'Theme', mode: 'dark', colors: { '--primary': '#123456' } }],
    'theme:delete-custom-theme': ['theme-1'], 'config:save-text-file': ['config.json', ''],
    'window:set-titlebar-overlay': [{ symbolColor: '#ffffff' }],
    'app:get-process-icon': ['C:\\Program Files\\Example\\app.exe'],
    'app:complete-profile-import': ['import-1'],
    'app:open-url': ['https://example.com/'], 'app:copy-to-clipboard': ['']
  }
  for (const channel of Object.values(IPC_CHANNELS).filter(channel => !channel.startsWith('event:'))) {
    const args = examples[channel] ?? []
    validate(channel, args)
    assert.throws(() => validate(channel, [...args, 'unexpected']), /Invalid IPC arguments/, `${channel}: extra arguments`)
    for (let index = 0; index < args.length; index++) {
      const invalid = [...args]; invalid[index] = null
      assert.throws(() => validate(channel, invalid), /Invalid IPC arguments/, `${channel}: argument ${index}`)
    }
  }
  validate('mihomo:get-rules', [])
  validate('mihomo:test-delay', ['Node', undefined, undefined])
  validate('profile:add', [{ type: 'local', content: '' }])
  validate('app:update-settings', [{ kernel: { dns: null, tun: { enable: false } }, general: { customLocalization: null } }])
  const invalid = [
    ['sysproxy:set', ['false']], ['app:open-folder', ['../../']],
    ['profile:set-active', ['../settings']], ['profile:update-info', ['profile-1', { id: 'replacement' }]],
    ['profile:update-info', ['profile-1', { autoUpdate: 'yes' }]],
    ['profile:update-info', ['profile-1', { interval: 14 }]],
    ['profile:add', [{ type: 'remote', updateViaProxy: 'false' }]],
    ['profile:save-custom-rules', ['profile-1', [{ ...rule, offset: -1 }]]],
    ['profile:save-custom-rules', ['profile-1', [{ ...rule, additionalParams: [false] }]]],
    ['app:update-settings', [{ kernel: { allowLan: 'yes' } }]],
    ['app:update-settings', [{ sysProxy: { bypass: 'localhost' } }]],
    ['app:update-settings', [{ general: { shortcuts: { toggle: false } } }]],
    ['app:update-settings', [{ general: { typo: true } }]],
    ['app:update-settings', [{ kernel: { tun: null } }]],
    ['app:update-settings', [{ kernel: { options: JSON.parse('{"__proto__":{"polluted":true}}') } }]],
    ['mihomo:patch-configs', [{ invalid: new Date() }]], ['mihomo:patch-configs', [{ port: NaN }]],
    ['mihomo:test-delay', ['Node', 'file:///private', 5000]],
    ['mihomo:test-delay', ['Node', undefined, Infinity]],
    ['theme:save-custom-theme', [{ id: 'theme-1', name: '', mode: 'dark', colors: { '--primary': 123 } }]],
    ['window:set-titlebar-overlay', [{ height: 100 }]]
  ]
  const cycle = {}; cycle.self = cycle
  invalid.push(['mihomo:patch-configs', [cycle]])
  let deep = {}; for (let level = 0; level < 40; level++) deep = { nested: deep }
  invalid.push(['mihomo:patch-configs', [deep]])
  for (const [channel, args] of invalid) assert.throws(() => validate(channel, args), /Invalid IPC arguments/, channel)
  assert.throws(() => validate('unknown:channel', []), /Invalid IPC arguments/)
}

verifyTrustedRegistration()
verifyAllChannelsProtected()
verifyArgumentContracts()
console.log('PASS: every IPC channel checks sender and arguments; malformed nested DTOs and unsafe config objects never execute commands')
