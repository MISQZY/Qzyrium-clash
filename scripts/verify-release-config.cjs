const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('yaml')
const { createRequire } = require('node:module')

const builderRequire = createRequire(require.resolve('electron-builder'))
const libraryRoot = path.dirname(builderRequire.resolve('app-builder-lib/package.json'))
const { validateConfiguration } = require(path.join(libraryRoot, 'out/util/config/config.js'))
const FpmTarget = require(path.join(libraryRoot, 'out/targets/FpmTarget.js')).default
const config = yaml.parse(fs.readFileSync('electron-builder.yml', 'utf8'))

async function verify() {
  await validateConfiguration(config, { add() {} })
  assert.ok(config.linux.target.some(item => item.target === 'deb'))
  assert.ok(config.linux.target.some(item => item.target === 'rpm'))
  assert.ok(config.rpm.depends.includes('libayatana-appindicator-gtk3'))
  assert.ok(!config.rpm.depends.includes('libayatana-appindicator3-1'))
  const metadata = require('../package.json')
  for (const target of ['deb', 'rpm']) {
    const meta = await FpmTarget.prototype.computeFpmMetaInfoOptions.call({
      options: { ...config.linux, ...config[target] },
      packager: { info: { metadata }, appInfo: { computePackageUrl: async () => `https://github.com/${config.publish.owner}/${config.publish.repo}` } }
    })
    assert.match(meta.maintainer, /.+ <.+@.+>/)
  }
  console.log('PASS: release configuration matches the installed electron-builder schema')
}

verify().catch(error => { console.error(error); process.exitCode = 1 })
