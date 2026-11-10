const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const main = fs.readFileSync(path.resolve('out/main/index.js'), 'utf8')
assert.ok(!/require\(["']\.\.\/utils\/elevation["']\)/.test(main), 'bundled elevation guard must not require an absent source module')
assert.ok(!/require\(["']\.\/logger["']\)/.test(main), 'admin restart logger must be included in the bundle')
const assets = path.resolve('out/renderer/assets')
const javascript = fs.readdirSync(assets).filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(assets, file), 'utf8')).join('\n')
const purifyVersion = require('dompurify').version
assert.ok(javascript.includes(purifyVersion), 'the patched DOMPurify implementation must be included in renderer assets')
assert.ok(!javascript.includes('3.4.15'), 'Monaco must not ship its vulnerable vendored DOMPurify copy')
console.log(`PASS: bundled elevation guard and patched DOMPurify ${purifyVersion}`)
