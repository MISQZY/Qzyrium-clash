const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

function load(file, dependencies) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const requireModule = (name) => {
    if (name in dependencies) return dependencies[name]
    if (name.startsWith('@shared/')) return load(path.resolve('src/shared', name.slice(8) + '.ts'), dependencies)
    return require(name)
  }
  vm.runInThisContext(`(function(exports, require) { ${code}\n})`, { filename: file })(exports, requireModule)
  return exports
}

function fixture({ packaged = true, portable = false, lastVersion, version = '0.3.0', fetch } = {}) {
  const updater = new EventEmitter()
  let checks = 0, downloads = 0, installs = 0, prepared = false, saved = lastVersion
  const requests = [], statuses = []
  updater.setFeedURL = (feed) => assert.equal(feed.repo, 'Qzyrium-clash')
  updater.checkForUpdates = async () => { checks++; updater.emit('checking-for-update'); await Promise.resolve(); updater.emit('update-available', { version: '0.4.0' }) }
  updater.downloadUpdate = async () => { downloads++; await Promise.resolve() }
  updater.quitAndInstall = () => { assert.ok(prepared, 'VPN cleanup must complete before installer starts'); installs++ }
  const dependencies = {
    electron: { app: { isPackaged: packaged, getVersion: () => version }, net: { fetch: async (url) => {
      requests.push(url)
      return { ok: true, json: async () => fetch ? fetch(url) : [] }
    } } },
    'electron-updater': { autoUpdater: updater },
    'node:fs': { readFileSync: () => JSON.stringify({ lastSeenVersion: saved }) },
    '../utils/paths': { getAppPaths: () => ({ userData: 'mock-data' }) },
    '../utils/atomicWrite': { writeFileAtomic: (_, data) => { saved = JSON.parse(data).lastSeenVersion } },
    '../utils/logger': { logger: { error() {}, warn() {} } }
  }
  const previousPortable = process.env.PORTABLE_EXECUTABLE_DIR
  if (portable) process.env.PORTABLE_EXECUTABLE_DIR = 'mock-portable'
  const { UpdateService } = load('src/main/services/UpdateService.ts', dependencies)
  const service = new UpdateService((_, status) => statuses.push(status), async () => { await Promise.resolve(); prepared = true })
  return { service, updater, requests, statuses, initialize: async () => {
    try { await service.initialize() } finally {
      if (previousPortable === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR
      else process.env.PORTABLE_EXECUTABLE_DIR = previousPortable
    }
  }, counts: () => ({ checks, downloads, installs }), saved: () => saved }
}

async function verify() {
  const sample = fixture()
  await sample.initialize()
  await Promise.all([sample.service.checkUpdates(), sample.service.checkUpdates()])
  assert.equal(sample.counts().checks, 1, 'startup and concurrent manual checks share a request')
  assert.equal(sample.service.getStatus().state, 'available')
  await Promise.all([sample.service.downloadUpdate(), sample.service.downloadUpdate()])
  assert.equal(sample.counts().downloads, 1, 'double click starts one download')
  sample.updater.emit('download-progress', { percent: 49.6 })
  assert.deepEqual(sample.service.getStatus(), { state: 'downloading', percent: 50 })
  sample.updater.emit('update-downloaded', { version: '0.4.0' })
  await new Promise(setImmediate)
  assert.equal(sample.counts().installs, 1)
  sample.updater.emit('error', new Error('offline'))
  assert.equal(sample.service.getStatus().state, 'error')
  await sample.service.checkUpdates()
  assert.equal(sample.service.getStatus().state, 'available', 'retry recovers from a network error')
  await sample.service.dispose()
  assert.equal(sample.updater.listenerCount('error'), 0)

  for (const options of [{ packaged: false }, { portable: true }]) {
    const unsupported = fixture(options)
    await unsupported.initialize()
    assert.equal((await unsupported.service.checkUpdates()).state, 'unsupported')
    await unsupported.service.downloadUpdate()
    assert.deepEqual(unsupported.counts(), { checks: 0, downloads: 0, installs: 0 })
  }
  const first = fixture()
  await first.initialize()
  assert.equal(await first.service.getWhatsNew(), null)
  assert.equal(first.requests.length, 0, 'first launch skips release notes')
  assert.equal(first.saved(), '0.3.0')
  for (const lastVersion of ['0.3.0', '0.4.0']) {
    const unchanged = fixture({ lastVersion })
    await unchanged.initialize()
    assert.equal(await unchanged.service.getWhatsNew(), null, 'same version or downgrade skips notes')
  }
  const upgraded = fixture({ lastVersion: '0.1.0', fetch: (url) => {
    if (url.includes('/releases?')) return [
      { tag_name: 'v0.2.0' }, { tag_name: 'v0.5.0' }, { tag_name: 'v0.3.0' },
      { tag_name: 'v0.4.0-beta.1', prerelease: true }, { tag_name: 'v0.1.0' }
    ]
    return { commits: ['chore: bump version to 0.3.0', 'Merge branch main', 'Fix VPN\nDetails', 'Add feature'].map(message => ({ commit: { message } })) }
  } })
  await upgraded.initialize()
  const notes = await upgraded.service.getWhatsNew()
  assert.deepEqual(notes.entries.map(entry => entry.version), ['0.3.0', '0.2.0'])
  assert.deepEqual(notes.entries[0].notes, ['Fix VPN', 'Add feature'])
  assert.ok(upgraded.requests.every(url => url.startsWith('https://api.github.com/repos/MISQZY/Qzyrium-clash/')))
  assert.equal(await upgraded.service.getWhatsNew(), notes, 'notes are fetched once per launch')
  const offline = fixture({ lastVersion: '0.1.0', fetch: () => { throw new Error('offline') } })
  await offline.initialize()
  assert.equal(await offline.service.getWhatsNew(), null)
  assert.equal(offline.saved(), '0.3.0', 'failed notes do not reannounce the update')
  const yaml = require('yaml').parse(fs.readFileSync('electron-builder.yml', 'utf8'))
  assert.equal(yaml.publish.repo, 'Qzyrium-clash')
  console.log('PASS: updater concurrency, download progress, cleanup before install, retry, portable/dev, first launch, upgrades, skipped versions, network failure and release configuration')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
