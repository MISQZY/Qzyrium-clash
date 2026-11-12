const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { loadTypeScript } = require('./fixtures/typescript.cjs')

async function verify() {
  const root = path.resolve('artifacts/system-proxy')
  fs.mkdirSync(root, { recursive: true })
  const directory = fs.mkdtempSync(path.join(root, 'run-'))
  const filename = path.join(directory, 'recovery.json')
  const { WindowsProxySettings, windowsProxyRegistry } = loadTypeScript('src/main/utils/windows-proxy.ts', {
    'node:util': { promisify: fn => (...args) => new Promise((resolve, reject) => fn(...args,
      (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }))) },
    './paths': { getAppPaths() { throw new Error('Tests must not access userData') } },
    'node:child_process': { execFile(file, args, options, callback) {
      assert.equal(file, 'reg.exe')
      assert.ok(options.windowsHide && options.timeout > 0)
      callback(null, '\r\nHKEY_CURRENT_USER\\fixture\r\n    ProxyEnable    REG_DWORD    0x1\r\n    ProxyServer    REG_SZ    company proxy:8080\r\n    ProxyOverride    REG_SZ    \r\n    AutoConfigURL    REG_EXPAND_SZ    %USERPROFILE%\\proxy.pac\r\n')
    } }
  })
  const original = await windowsProxyRegistry.read()
  assert.equal(original.ProxyEnable.data, '0x1')
  assert.equal(original.ProxyServer.data, 'company proxy:8080')
  assert.equal(original.ProxyOverride.data, '')
  assert.equal(original.AutoConfigURL.type, 'REG_EXPAND_SZ')
  let values = structuredClone(original), failName = null
  const writes = []
  const backend = {
    async read() { return structuredClone(values) },
    async write(name, value) {
      if (name === failName) { failName = null; throw new Error('Registry unavailable') }
      writes.push(name)
      values[name] = structuredClone(value)
    }
  }
  const registry = new WindowsProxySettings(backend, () => filename)
  const settings = loadTypeScript('src/shared/app-config.ts').DEFAULT_APP_CONFIG
  const code = ts.transpileModule(fs.readFileSync('src/main/services/SysProxyService.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  new Function('exports', 'require', 'process', code)(exports, name => {
    if (name === '../utils/windows-proxy') return { WindowsProxySettings }
    if (name === '../utils/logger') return { logger: { info() {}, error() {} } }
    if (name === '../utils/network-transition') return { flushSystemDns() {} }
    if (name === '../utils/pac') return loadTypeScript('src/main/utils/pac.ts')
    return require(name)
  }, { platform: 'win32' })
  const config = structuredClone(settings)
  config.sysProxy.enable = true
  const service = new exports.SysProxyService({ getSettings: () => config, updateSettings: async patch => Object.assign(config, patch) }, registry)
  await service.initialize()
  assert.deepEqual(values, original, 'startup without our journal leaves corporate proxy untouched')
  await service.setCoreRunning(true)
  assert.ok(fs.existsSync(filename), 'snapshot is durable before registry changes')
  assert.equal(values.ProxyServer.data, '127.0.0.1:7895')
  config.sysProxy.mode = 'pac'
  await service.setSysProxy(true)
  assert.equal(JSON.parse(fs.readFileSync(filename)).values.ProxyServer.data, original.ProxyServer.data, 'PAC transition retains original snapshot')
  await service.dispose()
  assert.deepEqual(values, original)
  assert.equal(writes.at(-1), 'ProxyEnable', 'restore enables original proxy last')
  assert.ok(!fs.existsSync(filename))

  values = { ProxyEnable: null, ProxyServer: null, ProxyOverride: null, AutoConfigURL: null }
  const absent = structuredClone(values)
  await registry.capture()
  await registry.set('ProxyEnable', '1', 'REG_DWORD')
  await new WindowsProxySettings(backend, () => filename).restore()
  assert.deepEqual(values, absent, 'a new instance restores absent values after interruption')

  values = structuredClone(original)
  config.sysProxy.mode = 'manual'
  await service.setCoreRunning(true)
  await service.setSysProxy(false)
  failName = 'ProxyOverride'
  await assert.rejects(service.setSysProxy(true), /Registry unavailable/)
  assert.deepEqual(values, original, 'partial enable failure rolls back all values')
  assert.equal(service.getStatus().enabled, false)
  await registry.capture()
  failName = 'ProxyServer'
  await assert.rejects(registry.restore(), /Registry unavailable/)
  assert.ok(fs.existsSync(filename), 'failed recovery keeps its journal for retry')
  await registry.restore()
  fs.writeFileSync(filename, '{broken')
  const count = writes.length
  await assert.rejects(registry.capture())
  await assert.rejects(registry.restore())
  assert.equal(writes.length, count, 'invalid journal never mutates the registry')
  console.log('PASS: original proxy/PAC/types/absent values, durable recovery, mode changes and partial registry failures')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
