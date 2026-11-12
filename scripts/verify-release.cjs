const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('yaml')
const { version } = require('../package.json')

const stage = process.argv[2]
if (stage === 'version') {
  const tag = process.env.RELEASE_TAG
  assert.match(tag ?? '', /^v\d+\.\d+\.\d+$/, 'Release tags must use vX.Y.Z')
  assert.equal(tag, `v${version}`, 'Release tag must match package.json version')
} else if (stage === 'resources') {
  assert.ok(!fs.existsSync(path.join('extra', 'files', 'qzyrium-windows.exe')), 'Removed Windows helper must not be bundled')
  for (const file of ['sidecar/mihomo.exe', 'files/country.mmdb', 'files/geosite.dat', 'files/geoip.dat', 'files/qzyrium-run.exe', 'files/qzyrium-watchdog.exe']) {
    assert.ok(fs.statSync(path.join('extra', file)).size > 0, `Missing or empty runtime resource: ${file}`)
  }
} else if (stage === 'assets') {
  const config = yaml.parse(fs.readFileSync('electron-builder.yml', 'utf8'))
  const values = { productName: config.productName, version, arch: 'x64', ext: 'exe' }
  const expand = pattern => pattern.replace(/\$\{(productName|version|arch|ext)\}/g, (_, key) => values[key])
  const installer = expand(config.nsis.artifactName)
  const portable = expand(config.win.artifactName)
  for (const file of [portable, installer, `${installer}.blockmap`, 'latest.yml']) {
    assert.ok(fs.statSync(path.join('dist', file)).size > 0, `Missing or empty release asset: ${file}`)
  }
  const latest = yaml.parse(fs.readFileSync('dist/latest.yml', 'utf8'))
  assert.equal(latest.version, version, 'Updater metadata must match the application version')
  assert.ok(latest.files?.some(file => decodeURIComponent(file.url) === installer), 'Updater metadata must reference the NSIS installer')
} else {
  throw new Error('Usage: node scripts/verify-release.cjs <version|resources|assets>')
}
console.log(`PASS: release ${stage}`)
