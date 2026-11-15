const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('yaml')
const { createHash } = require('node:crypto')
const { verifyRuntimeResources } = require('./resource-integrity.cjs')
const { version } = require('../package.json')

const stage = process.argv[2]
if (stage === 'version') {
  const tag = process.env.RELEASE_TAG
  assert.match(tag ?? '', /^v\d+\.\d+\.\d+$/, 'Release tags must use vX.Y.Z')
  assert.equal(tag, `v${version}`, 'Release tag must match package.json version')
} else if (stage === 'resources') {
  verifyRuntimeResources('extra')
  assert.ok(!fs.existsSync(path.join('extra', 'files', 'qzyrium-windows.exe')), 'Removed Windows helper must not be bundled')
  const expectedFiles = process.platform === 'win32'
    ? ['sidecar/mihomo.exe', 'files/country.mmdb', 'files/geosite.dat', 'files/geoip.dat', 'files/qzyrium-run.exe', 'files/qzyrium-watchdog.exe']
    : ['sidecar/mihomo', 'files/country.mmdb', 'files/geosite.dat', 'files/geoip.dat', 'files/linux-core-supervisor.cjs', 'files/linux-proxy-watchdog.cjs', 'files/linux-proxy-recovery.cjs']
  for (const file of expectedFiles) {
    assert.ok(fs.statSync(path.join('extra', file)).size > 0, `Missing or empty runtime resource: ${file}`)
  }
} else if (stage === 'assets') {
  const config = yaml.parse(fs.readFileSync('electron-builder.yml', 'utf8'))
  if (process.platform === 'win32') {
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
    assert.equal(decodeURIComponent(latest.path), installer, 'Legacy updater path must reference the same installer')
    assert.equal(latest.sha512, latest.files.find(file => decodeURIComponent(file.url) === installer).sha512, 'Legacy updater digest must match the installer entry')
    for (const file of latest.files) {
      const filename = decodeURIComponent(file.url)
      assert.equal(path.basename(filename), filename, 'Updater assets must be local filenames')
      const bytes = fs.readFileSync(path.join('dist', filename))
      assert.equal(file.size, bytes.length, `Updater size does not match ${filename}`)
      assert.equal(file.sha512, createHash('sha512').update(bytes).digest('base64'), `Updater SHA-512 does not match ${filename}`)
    }
  } else if (process.platform === 'linux') {
    const distFiles = fs.readdirSync('dist')
    const appImage = distFiles.find(file => file.endsWith('.AppImage') && file.includes(version))
    const deb = distFiles.find(file => file.endsWith('.deb') && file.includes(version))
    const rpm = distFiles.find(file => file.endsWith('.rpm') && file.includes(version))
    const tar = distFiles.find(file => (file.endsWith('.tar.gz') || file.endsWith('.tgz')) && file.includes(version))
    assert.ok(appImage, 'Missing AppImage release asset in dist/')
    assert.ok(deb, 'Missing .deb release asset in dist/')
    assert.ok(rpm, 'Missing .rpm release asset in dist/')
    assert.ok(tar, 'Missing .tar.gz release asset in dist/')
    if (fs.existsSync(path.join('dist', 'latest-linux.yml'))) {
      const latest = yaml.parse(fs.readFileSync('dist/latest-linux.yml', 'utf8'))
      assert.equal(latest.version, version, 'Linux updater metadata must match application version')
    }
  }
} else {
  throw new Error('Usage: node scripts/verify-release.cjs <version|resources|assets>')
}
console.log(`PASS: release ${stage}`)
