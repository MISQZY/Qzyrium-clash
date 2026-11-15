const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { loadTypeScript } = require('./fixtures/typescript.cjs')
const { SubscriptionTrafficAccounting } = loadTypeScript('src/main/core/SubscriptionTrafficAccounting.ts')

// Exercise accounting without launching a core or changing OS network settings.
const exportsObject = {}
const accounting = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/main/core/TrafficAccounting.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: accounting, require: () => ({}) })
const code = ts.transpileModule(fs.readFileSync('src/main/services/KernelService.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
vm.runInNewContext(code, { exports: exportsObject, require: name => name.endsWith('/TrafficAccounting') ? accounting : {} })

async function verify() {
  const kernel = Object.create(exportsObject.KernelService.prototype)
  kernel.trafficAccounting = new accounting.TrafficAccounting()
  kernel.subscriptionTraffic = new SubscriptionTrafficAccounting()
  let status = 'running'
  kernel.getStatus = () => status
  kernel.profileService = { getActiveProfile: () => null }
  kernel.resetDirectTraffic()
  let snapshot
  kernel.apiClient = { getConnections: async () => snapshot }
  const connection = (id, download, upload, chains) => ({ id, download, upload, chains })
  snapshot = { downloadTotal: 100, uploadTotal: 10, connections: [connection('direct', 100, 10, ['DIRECT'])] }
  await kernel.getConnections()
  snapshot = { downloadTotal: 1000, uploadTotal: 100, connections: [] }
  let result = await kernel.getConnections()
  assert.equal(result.vpnDownloadTotal, 0, 'a completed DIRECT transfer must never become VPN traffic')
  assert.equal(result.vpnUploadTotal, 0)
  snapshot = { downloadTotal: 1500, uploadTotal: 150, connections: [connection('proxy', 500, 50, ['node', 'PROXY'])] }
  result = await kernel.getConnections()
  assert.equal(result.vpnDownloadTotal, 500)
  assert.equal(result.vpnUploadTotal, 50)
  assert.equal((await kernel.getConnections()).vpnDownloadTotal, 500, 'repeated snapshots cannot double count')
  snapshot = { downloadTotal: 1800, uploadTotal: 180, connections: [connection('proxy', 800, 80, ['node', 'PROXY'])] }
  assert.equal((await kernel.getConnections()).vpnDownloadTotal, 800)
  snapshot = { downloadTotal: 1900, uploadTotal: 190, connections: [] }
  result = await kernel.getConnections()
  assert.equal(result.vpnDownloadTotal, 800, 'unobserved bytes stay unclassified')
  assert.equal(result.vpnTrafficIsLowerBound, true, 'the UI must disclose incomplete observations')
  snapshot = { downloadTotal: 0, uploadTotal: 0, connections: [] }
  result = await kernel.getConnections()
  assert.equal(result.vpnDownloadTotal, 0, 'a new core session resets accounting')
  assert.equal(result.directDownloadTotal, 0)
  const profile = { id: 'subscription', lastFetchedAt: 1, userInfo: { download: 100, total: 1000 } }
  kernel.profileService.getActiveProfile = () => profile
  kernel.subscriptionTraffic.beginSession(profile)
  snapshot = { downloadTotal: 200, uploadTotal: 0, connections: [connection('quota', 200, 0, ['node', 'PROXY'])] }
  assert.equal((await kernel.getConnections()).subscriptionTraffic.runtimeDeltaBytes, 200)
  kernel.resetDirectTraffic()
  kernel.apiClient.getConnections = async () => { throw new Error('Stopped core must not be queried') }
  for (status of ['stopped', 'error', 'starting']) {
    result = await kernel.getConnections()
    assert.equal(result.subscriptionTraffic.runtimeDeltaBytes, 200, 'offline reads retain quota independently of session totals')
    assert.equal(result.connections.length, 0)
    assert.equal(result.downloadTotal, 0)
  }
  assert.equal(kernel.subscriptionTraffic.get({ ...profile, id: 'other' }).runtimeDeltaBytes, 0)
  assert.equal(kernel.subscriptionTraffic.get({ ...profile, lastFetchedAt: 2 }).runtimeDeltaBytes, 0)
  console.log('PASS: sampled VPN accounting, closed DIRECT traffic, duplicate snapshots and session reset')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
