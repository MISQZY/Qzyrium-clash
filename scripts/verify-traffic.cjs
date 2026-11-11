const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

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
  console.log('PASS: sampled VPN accounting, closed DIRECT traffic, duplicate snapshots and session reset')
}
verify().catch(error => { console.error(error); process.exitCode = 1 })
