const { app, nativeImage } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const output = path.resolve(__dirname, '../artifacts/tray-check')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
app.commandLine.appendSwitch('disable-features', 'WinUseBrowserSpellChecker')
app.commandLine.appendSwitch('disable-spellcheck')
app.disableHardwareAcceleration()

function load(file, dependencies = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInThisContext(`(function(exports, require) {\n${code}\n})`, { filename: file })(exports, name => dependencies[name] ?? require(name))
  return exports
}

app.whenReady().then(async () => {
  const { getVpnStatus } = load('src/shared/vpn-status.ts')
  assert.equal(getVpnStatus('running'), 'on')
  assert.equal(getVpnStatus('stopped'), 'off')
  assert.equal(getVpnStatus('starting'), 'starting')
  assert.equal(getVpnStatus('error'), 'error')
  const { createTrayIcon } = load('src/main/utils/tray-icon.ts')
  const logo = nativeImage.createFromPath(path.resolve('resources/icon.png'))
  const backgrounds = new Set()
  for (const status of ['on', 'off', 'starting', 'error']) {
    const icon = createTrayIcon(logo, status)
    assert.equal(icon.isEmpty(), false)
    assert.deepEqual(icon.getSize(), { width: 16, height: 16 })
    assert.deepEqual(icon.getScaleFactors(), [1, 2, 3, 4])
    const bitmap = icon.toBitmap({ scaleFactor: 4 })
    assert.equal(bitmap[3], 0, 'rounded corners must remain transparent')
    assert.equal(bitmap[(32 * 64 + 32) * 4 + 3], 255, 'icon center must be opaque')
    backgrounds.add(bitmap.subarray((2 * 64 + 32) * 4, (2 * 64 + 32) * 4 + 3).toString('hex'))
    fs.writeFileSync(path.join(output, `${status}.png`), icon.toPNG({ scaleFactor: 4 }))
  }
  assert.equal(backgrounds.size, 4, 'all four states need different backgrounds')
  assert.equal(createTrayIcon(nativeImage.createEmpty(), 'off').isEmpty(), false)

  let currentTray, core = 'stopped', proxy = false
  const settings = { general: { language: 'en' }, kernel: { mode: 'rule', tun: { enable: false } } }
  class FixtureTray {
    constructor(image) { this.image = image; currentTray = this }
    setImage(image) { this.image = image }
    setToolTip(text) { this.tooltip = text }
    setContextMenu(menu) { this.menu = menu }
    on() {}
    destroy() { this.destroyed = true }
  }
  const { TrayService } = load('src/main/services/TrayService.ts', {
    electron: { app: { getAppPath: () => process.cwd() }, nativeImage, Tray: FixtureTray, Menu: { buildFromTemplate: menu => menu } },
    '@shared/vpn-status': { getVpnStatus }, '../utils/tray-icon': { createTrayIcon },
    '@shared/locales/en.json': require('../src/shared/locales/en.json'), '@shared/locales/ru.json': require('../src/shared/locales/ru.json')
  })
  const service = new TrayService({}, { getStatus: () => core }, { getStatus: () => ({ enabled: proxy }), setSysProxy: async enabled => { proxy = enabled } }, { getSettings: () => settings })
  await service.initialize()
  assert.match(currentTray.tooltip, /VPN off/)
  const off = currentTray.image
  core = 'running'
  service.updateContextMenu()
  assert.notEqual(currentTray.image, off, 'running core without capture must be on')
  const on = currentTray.image
  await currentTray.menu.find(item => item.label?.startsWith('System proxy')).click()
  assert.match(currentTray.tooltip, /VPN on/)
  assert.notEqual(currentTray.image, off)
  settings.kernel.mode = 'direct'
  service.updateContextMenu()
  assert.equal(currentTray.image, on, 'Direct must keep the running core indicator on')
  settings.kernel.mode = 'global'
  proxy = false
  settings.kernel.tun.enable = true
  service.updateContextMenu()
  assert.match(currentTray.tooltip, /VPN on/)
  core = 'stopped'
  service.updateContextMenu()
  assert.equal(currentTray.image, off)
  core = 'error'
  service.updateContextMenu()
  assert.match(currentTray.tooltip, /Error/)
  await service.dispose()
  assert.equal(currentTray.destroyed, true)
  console.log('PASS: VPN state, rounded transparent corners, four colors, DPI scales and live tray updates')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
