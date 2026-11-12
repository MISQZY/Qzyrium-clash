const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const AdmZip = require('adm-zip')
const { loadTypeScript: load } = require('./fixtures/typescript.cjs')
const { createDiagnostics, redactDiagnosticLog } = load('src/main/utils/diagnostics.ts')
const { DEFAULT_APP_CONFIG } = load('src/shared/app-config.ts')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qzyrium-diagnostics-'))

;(async () => {
  const settings = structuredClone(DEFAULT_APP_CONFIG)
  settings.kernel.controllerSecret = 'private-controller-secret'
  settings.kernel.options = { authentication: ['private-user:private-password'] }
  settings.sysProxy.pacScript = 'private PAC content'
  const profiles = [{ profile: { id: 'private-id', name: 'private-profile', type: 'remote', updatedAt: 1, url: 'https://private-provider.example/subscription/private-token' },
    content: 'proxies:\n  - name: private-node\n    type: trojan\n    server: private-endpoint.example\n    password: private-node-password\n' }]
  const sample = '[2026-11-12T12:00:00.000Z] [ERROR] [app] timeout private-controller-secret private-node-password private-profile private-id private-node private-user:private-password 203.0.113.9 [2001:db8::1] private-host.example private@example.com\n'
    + '[2026-11-12T12:00:00.000Z] [WARNING] [app] failed C:\\Users\\private-name\\AppData\\settings.json\n'
    + '[2026-11-12T12:00:00.000Z] [WARNING] [app] token=private-token username="private-login" https://private-provider.example/subscription/private-token\n'
    + '[2026-11-12T12:00:00.000Z] [INFO] [app] do not export ordinary activity\n'
  fs.mkdirSync(path.join(directory, 'app'))
  fs.writeFileSync(path.join(directory, 'app', 'latest.log'), sample)
  fs.writeFileSync(path.join(directory, 'app', '2026-11-11T00-00-00-000Z.log'), '[WARNING] previous session error\n')
  const input = { appVersion: 'test', runtimeVersions: { node: process.versions.node }, coreVersion: 'unknown', coreStatus: 'stopped', settings, profiles, logsDir: directory }
  const buffer = await createDiagnostics(input)
  const archive = new AdmZip(buffer)
  const names = archive.getEntries().map(entry => entry.entryName)
  assert.deepEqual(names.sort(), ['logs/app.log', 'report.json'])
  const exported = archive.getEntries().map(entry => entry.getData().toString('utf8')).join('\n')
  for (const secret of ['private-controller-secret', 'private-node-password', 'private-profile', 'private-id', 'private-node', 'private-user', 'private-password',
    '203.0.113.9', '2001:db8::1', 'private-host.example', 'private@example.com', 'private-name', 'private-token', 'private-login', 'private PAC content', 'private-provider.example']) {
    assert.ok(!exported.includes(secret), `diagnostics redacts ${secret}`)
  }
  assert.ok(exported.includes('timeout'), 'keeps useful failure context')
  assert.ok(exported.includes('previous session error'), 'includes errors from the previous log archive')
  assert.ok(!exported.includes('ordinary activity'), 'excludes routine connection activity')
  const report = JSON.parse(archive.readAsText('report.json'))
  assert.equal(report.core.status, 'stopped')
  assert.equal(report.profiles.total, 1)
  assert.equal(report.logs.connections, 'unavailable', 'missing log files do not prevent export')
  assert.equal(report.settings.kernel.controllerSecret, undefined)
  assert.equal(redactDiagnosticLog('password=pw pw x', ['pw']), 'password=[REDACTED] [REDACTED] x', 'short credentials are also masked')
  const broken = await createDiagnostics({ ...input, profiles: [{ ...profiles[0], content: 'invalid: [' }] })
  assert.ok(!new AdmZip(broken).getEntries().some(entry => entry.entryName.startsWith('logs/')), 'logs are omitted if secrets cannot be extracted safely')
  console.log('PASS: diagnostics ZIP, bounded log excerpts, previous errors, missing logs and credential/address/path redaction')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  const resolved = fs.realpathSync(directory)
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()))
  assert.ok(path.basename(resolved).startsWith('qzyrium-diagnostics-'))
  fs.rmSync(resolved, { recursive: true, force: true })
})
