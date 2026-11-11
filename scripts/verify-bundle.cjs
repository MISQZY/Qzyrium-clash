const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const main = fs.readFileSync(path.resolve('out/main/index.js'), 'utf8')
assert.ok(!/powershell\.exe|pwsh\.exe|EncodedCommand|\.ps1\b/i.test(main), 'application main bundle must not invoke PowerShell or install PowerShell scripts')
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
