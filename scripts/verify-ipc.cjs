const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { createIpcFixture } = require('./fixtures/ipc.cjs')

function load(file, dependencies = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  new vm.Script(`(function(exports, require){${code}\n})`, { filename: file }).runInThisContext()(exports, name => {
    if (name in dependencies) return dependencies[name]
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8) + '.ts')
      : name.startsWith('.') ? path.resolve(path.dirname(file), name + '.ts') : null
    if (name.startsWith('.') && name.endsWith('.json')) return require(path.resolve(path.dirname(file), name))
    return target && fs.existsSync(target) ? load(target, dependencies) : require(name)
  })
  return exports
}

function verifyTrustedRegistration() {
  const fixture = createIpcFixture()
  const callbacks = new Map()
  let currentWindow = fixture.windowService.getMainWindow(), calls = 0
  const { createTrustedRegistrar } = load('src/main/ipc/trusted-handler.ts')
  const handle = createTrustedRegistrar({ handle: (channel, callback) => callbacks.set(channel, callback) }, {
    getMainWindow: () => currentWindow, getRendererUrl: fixture.windowService.getRendererUrl
  })
  handle('command', (_event, value) => { calls++; return value })
  const invoke = event => callbacks.get('command')(event, 123)
  assert.equal(invoke(fixture.event), 123)
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
  assert.equal(invoke(fixture.event), 123, 'same document may use query/hash navigation')
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
  assert.equal(invoke(replacement.event), 123)
  assert.equal(calls, 3, 'rejected senders never reach the command')
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

verifyTrustedRegistration()
verifyAllChannelsProtected()
console.log('PASS: all IPC channels reject foreign windows, subframes, changed documents and stale senders before executing commands')
