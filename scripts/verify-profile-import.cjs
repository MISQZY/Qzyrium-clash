const assert = require('node:assert/strict')
const { loadTypeScript } = require('./fixtures/typescript.cjs')
const { ProfileImportQueue } = loadTypeScript('src/main/utils/profile-import-queue.ts')
const delivered = []
const queue = new ProfileImportQueue(request => delivered.push(request))
const url = 'https://example.com/sub'
queue.add(`qzyrium://install-config?url=${encodeURIComponent(url)}&name=First`)
queue.add(`clash://install-config?url=${encodeURIComponent(url + '2')}`)
assert.equal(delivered.length, 0, 'slow startup/core-only waits for renderer subscription')
queue.rendererReady()
assert.equal(delivered.length, 1)
assert.equal(delivered[0].url, url)
queue.rendererReady()
assert.equal(delivered.length, 1, 'repeated subscription does not reset a dialog')
queue.complete('stale-id')
assert.equal(delivered.length, 1)
queue.resetRenderer()
queue.rendererReady()
assert.equal(delivered.length, 2, 'renderer reload redelivers its unfinished request')
assert.equal(delivered[1].id, delivered[0].id)
queue.complete(delivered[0].id)
assert.equal(delivered.length, 3, 'next link waits for dismissal/completion')
assert.equal(delivered[2].url, url + '2')
queue.complete(delivered[0].id)
assert.equal(delivered.length, 3, 'old acknowledgement cannot discard the next request')
queue.complete(delivered[2].id)
queue.resetRenderer()
queue.rendererReady()
assert.equal(delivered.length, 3, 'completed links do not repeat')

// Exercise the actual entry point without starting Electron or its services.
const ts = require('typescript')
const path = require('node:path')
const handlers = new Map()
const code = ts.transpileModule(require('node:fs').readFileSync('src/main/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
const deps = {
  electron: { app: {
    setName() {}, getPath: () => '/fixture', commandLine: { appendSwitch() {} },
    requestSingleInstanceLock: () => true, on: (name, handler) => handlers.set(name, handler),
    whenReady: () => ({ then() {} })
  } },
  '@electron-toolkit/utils': { electronApp: { setAppUserModelId() {} } },
  './utils/logger': { logger: { configureSettings() {}, initialize() {} } },
  '@shared/settings-config': { normalizeSettings: () => ({ general: {} }) },
  '@shared/rendering-policy': { renderingSwitches: () => [] },
  'node:fs': { existsSync: () => false, readFileSync: () => '{}' }, 'node:path': path
}
const startup = new Function('exports', 'require', 'process', `${code}
return { pendingProtocolUrls, ready(windowService) { services = { windowService }; servicesReady = true } }
`)({}, name => deps[name] ?? {}, { platform: 'darwin', argv: ['app'], on() {} })
let prevented = 0
const event = { preventDefault() { prevented++ } }
const openUrl = handlers.get('open-url')
assert.equal(typeof openUrl, 'function', 'open-url is registered before app.ready')
openUrl(event, 'clash://install-config?url=early')
openUrl(event, 'https://example.com/ignored')
assert.deepEqual(startup.pendingProtocolUrls, ['clash://install-config?url=early'])
const imports = []
startup.ready({ queueProfileImport: url => imports.push(url) })
for (const scheme of ['clash', 'mihomo', 'qzyrium']) openUrl(event, `${scheme}://install-config?url=ready`)
assert.equal(imports.length, 3, 'running instance imports all supported URL schemes')
assert.equal(startup.pendingProtocolUrls.length, 1, 'ready links do not accumulate in the startup queue')
assert.equal(prevented, 5)
console.log('PASS: import queue waits for subscription, survives renderer replacement and serializes links until dialog completion')
