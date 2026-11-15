const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('yaml')
const { createRequire } = require('node:module')

const builderRequire = createRequire(require.resolve('electron-builder'))
const libraryRoot = path.dirname(builderRequire.resolve('app-builder-lib/package.json'))
const { validateConfiguration } = require(path.join(libraryRoot, 'out/util/config/config.js'))
const FpmTarget = require(path.join(libraryRoot, 'out/targets/FpmTarget.js')).default
const { FileMatcher, getFileMatchers } = require(path.join(libraryRoot, 'out/fileMatcher.js'))
const config = yaml.parse(fs.readFileSync('electron-builder.yml', 'utf8'))

async function verify() {
  await validateConfiguration(config, { add() {} })
  const root = process.cwd()
  const stat = { isDirectory: () => false }
  const mainFilter = new FileMatcher(root, '/package', value => value, config.files).createFilter()
  assert.ok(mainFilter(path.join(root, 'resources/icon.png'), stat))
  assert.ok(!mainFilter(path.join(root, 'resources/linux-core-supervisor.cjs'), stat), 'Linux helpers belong only in Linux extraResources')
  for (const platform of ['win', 'linux']) {
    const matchers = getFileMatchers(config, 'extraResources', path.join(root, 'dist/resources'), {
      macroExpander: value => value, customBuildOptions: config[platform],
      globalOutDir: path.join(root, 'dist'), defaultSrc: root
    })
    const extra = matchers.find(matcher => matcher.from === path.join(root, 'extra'))
    const filter = extra.createFilter()
    const accepts = file => filter(path.join(extra.from, file), stat)
    for (const file of ['country.mmdb', 'geosite.dat', 'geoip.dat']) assert.ok(accepts(`files/${file}`))
    assert.equal(accepts('sidecar/mihomo.exe'), platform === 'win')
    assert.equal(accepts('files/qzyrium-run.exe'), platform === 'win')
    assert.equal(accepts('files/qzyrium-watchdog.exe'), platform === 'win')
    assert.equal(accepts('sidecar/mihomo'), platform === 'linux')
    for (const name of ['linux-core-supervisor.cjs', 'linux-proxy-watchdog.cjs', 'linux-proxy-recovery.cjs']) {
      assert.ok(!accepts(`files/${name}`), 'stale helper copies in extra are excluded')
      assert.equal(matchers.some(matcher => matcher.from === path.join(root, 'resources', name)), platform === 'linux')
    }
    assert.ok(matchers.some(matcher => matcher.from === path.join(root, 'LICENSE')), 'common licenses remain packaged')
  }
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
