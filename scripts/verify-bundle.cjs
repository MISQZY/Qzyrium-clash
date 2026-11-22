const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')

const main = fs.readFileSync(path.resolve('out/main/index.js'), 'utf8')
// ACL verification must bootstrap through the OS, before trusting bundled EXEs.
// Allow only this fixed, in-memory policy; never restore shell-based launchers
// or installed .ps1 helpers.
assert.ok(!/pwsh\.exe|\.ps1\b/i.test(main), 'application main bundle must not install or launch PowerShell script files')
assert.equal((main.match(/powershell\.exe/gi) ?? []).length, 1, 'only the ACL verifier may invoke PowerShell')
assert.equal((main.match(/EncodedCommand/g) ?? []).length, 1, 'only the fixed in-memory ACL policy may use an encoded command')
assert.match(main, /trustedSystemBinary\(["']WindowsPowerShell\/v1\.0\/powershell\.exe["']\)/, 'ACL verification must resolve PowerShell independently of mutable environment variables')
assert.ok(!main.includes('__QZYRIUM_EXECUTABLE_PINS__'), 'runtime trust pins must be embedded at build time')
for (const filename of [
  path.resolve('extra/sidecar', process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'),
  ...(process.platform === 'win32' ? ['qzyrium-run.exe', 'qzyrium-watchdog.exe'].map(name => path.resolve('extra/files', name)) : [])
]) {
  const digest = createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
  assert.ok(main.includes(digest), `main bundle must pin the exact packaged executable: ${path.basename(filename)}`)
}
assert.ok(!main.includes('qzyrium-windows'), 'removed Windows helper must not be referenced by the main bundle')
assert.ok(!/require\(["']\.\.\/utils\/elevation["']\)/.test(main), 'bundled elevation guard must not require an absent source module')
assert.ok(!/require\(["']\.\/logger["']\)/.test(main), 'admin restart logger must be included in the bundle')
const assets = path.resolve('out/renderer/assets')
const javascript = fs.readdirSync(assets).filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(assets, file), 'utf8')).join('\n')
assert.ok(!javascript.includes('3.4.15'), 'Vulnerable DOMPurify copy must not be present in renderer bundle')
assert.ok(!javascript.includes('MonacoEnvironment'), 'Monaco editor must be replaced by CodeMirror 6')
// Follow static imports from the HTML entry. Lazy editor code must not become a
// startup dependency through a vendor chunk (e.g. a broad "react" match).
const html = fs.readFileSync(path.resolve('out/renderer/index.html'), 'utf8')
const startup = new Set()
function visit(filename) {
  if (startup.has(filename)) return
  startup.add(filename)
  const code = fs.readFileSync(filename, 'utf8')
  for (const match of code.matchAll(/\bimport\s*(?:[^"'();]*?\bfrom\s*)?["']([^"']+)["']/g)) {
    if (match[1].startsWith('.')) visit(path.resolve(path.dirname(filename), match[1]))
  }
}
for (const match of html.matchAll(/(?:src|href)="([^" ]+\.js)"/g)) {
  visit(path.resolve('out/renderer', match[1].replace(/^\//, '')))
}
assert.ok(startup.size > 0, 'production HTML must reference JavaScript')
assert.ok([...startup].every(file => !/codemirror|YamlEditor|ProfileFileEditorDialog/i.test(path.basename(file))), 'editors must remain outside the static startup dependency graph')
assert.ok([...startup].every(file => !fs.readFileSync(file, 'utf8').includes('cm-editor')), 'CodeMirror view implementation must not be bundled inside startup vendor chunks')
console.log('PASS: bundled elevation guard and verified lightweight CodeMirror 6 renderer bundle')
