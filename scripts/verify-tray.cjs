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
  vm.runInThisContext(`(function(exports, require) {\n${code}\n})`, { filename: file })(exports, name => {
    if (dependencies[name]) return dependencies[name]
    const target = name.startsWith('@shared/') ? path.resolve('src/shared', name.slice(8))
      : name.startsWith('.') ? path.resolve(path.dirname(file), name) : null
    if (target?.endsWith('.json')) return require(target)
    return target && fs.existsSync(target + '.ts') ? load(target + '.ts') : require(name)
  })
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
  let coreOnly = false
  const windowService = { isCoreOnlyMode: () => coreOnly, setCoreOnlyMode: value => { coreOnly = value; service.updateContextMenu() }, show: () => { coreOnly = false; service.updateContextMenu() } }
  const service = new TrayService(windowService, { getStatus: () => core }, { getStatus: () => ({ enabled: proxy }), setSysProxy: async enabled => { proxy = enabled } }, { getSettings: () => settings }, { setSystemProxy: async enabled => { proxy = enabled } })
  await service.initialize()
  currentTray.menu.find(item => item.label === 'Core only').click()
  assert.equal(currentTray.menu.find(item => item.label === 'Core only').checked, true)
  currentTray.menu.find(item => item.label === 'Core only').click()
  assert.equal(currentTray.menu.find(item => item.label === 'Core only').checked, false)
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

  // Verify Routing Mode and Selectors in tray context menu
  let selectedProxy = { group: '', proxy: '' }
  const proxiesData = {
    Alpha: { name: 'Alpha', type: 'Selector', now: 'Node 1', all: ['Node 1'] },
    PROXY: { name: 'PROXY', type: 'Selector', now: 'Node 1', all: ['Node 1', 'Node 2'] },
    Zulu: { name: 'Zulu', type: 'Selector', now: 'Node 1', all: ['Node 1'] },
    Extra: { name: 'Extra', type: 'Selector', now: 'Node 1', all: ['Node 1'] },
    Hidden: { name: 'Hidden', type: 'Selector', hidden: true, all: ['Node 1'] },
    GLOBAL: { name: 'GLOBAL', type: 'Selector', now: 'PROXY', all: ['PROXY', 'Zulu', 'Hidden', 'Alpha', 'DIRECT'] }
  }
  const testKernel = {
    getStatus: () => core,
    getProxies: async () => proxiesData,
    selectProxy: async (g, p) => { selectedProxy = { group: g, proxy: p }; proxiesData[g].now = p },
    patchConfigs: async () => {},
    reloadConfig: async () => {}
  }
  const testSettings = {
    general: { language: 'ru' },
    kernel: { mode: 'rule', tun: { enable: false } }
  }
  const testSettingService = {
    getSettings: () => testSettings,
    updateSettings: async (patch) => {
      if (patch.kernel) testSettings.kernel = { ...testSettings.kernel, ...patch.kernel }
      return testSettings
    }
  }
  const testWinService = {
    isCoreOnlyMode: () => false,
    setCoreOnlyMode: () => {},
    broadcast: () => {},
    show: () => {},
    setQuitting: () => {}
  }
  const fullService = new TrayService(testWinService, testKernel, { getStatus: () => ({ enabled: false }), setSysProxy: async () => {} }, testSettingService, { setRoutingMode: async mode => { await testKernel.patchConfigs({ mode }); await testSettingService.updateSettings({ kernel: { ...testSettingService.getSettings().kernel, mode } }) } })
  await fullService.initialize()

  // When stopped: no selectors or proxy groups in tray menu
  core = 'stopped'
  fullService.updateContextMenu()
  assert.equal(currentTray.menu.some(item => item.label === 'Селекторы'), false, 'Selectors item must not exist')
  assert.equal(currentTray.menu.some(item => item.label?.startsWith('PROXY')), false, 'Proxy groups must not exist when stopped')

  // When running:
  core = 'running'
  await fullService.refreshProxies()
  fullService.updateContextMenu()
  const trayGroupNames = () => currentTray.menu
    .filter(item => item.submenu && Object.keys(proxiesData).some(name => item.label?.startsWith(`${name}:`)))
    .map(item => item.label.split(':')[0])
  assert.deepEqual(trayGroupNames(), ['PROXY', 'Zulu', 'Alpha', 'Extra'], 'Tray must follow provider order, hide hidden groups and append groups missing from GLOBAL in API order')

  const providerOrder = proxiesData.GLOBAL.all
  proxiesData.GLOBAL.all = []
  fullService.updateContextMenu()
  assert.deepEqual(trayGroupNames(), ['Alpha', 'PROXY', 'Zulu', 'Extra'], 'Tray must fall back to API order without configured group order')
  proxiesData.GLOBAL.all = providerOrder
  fullService.updateContextMenu()

  // Verify Routing mode menu
  const modeItem = currentTray.menu.find(item => item.label?.startsWith('Режим маршрутизации'))
  assert.ok(modeItem, 'Routing mode menu item must exist')
  assert.equal(modeItem.submenu.length, 3, 'Must have 3 mode options')
  const ruleOption = modeItem.submenu.find(i => i.label === 'По правилам')
  assert.equal(ruleOption.checked, true, 'Rule mode must be checked')

  // Verify no "Селекторы" item exists
  assert.equal(currentTray.menu.some(item => item.label === 'Селекторы'), false, 'Selectors item must not exist')

  // Verify proxy groups appear directly in tray context menu as subgroups
  const proxyGroup = currentTray.menu.find(item => item.label?.startsWith('PROXY'))
  assert.ok(proxyGroup, 'PROXY group must be present directly in tray menu')
  assert.ok(Array.isArray(proxyGroup.submenu), 'PROXY group must have submenu')
  const node2Option = proxyGroup.submenu.find(item => item.label === 'Node 2')
  assert.ok(node2Option, 'Node 2 option must exist in PROXY group')
  assert.equal(node2Option.checked, false, 'Node 2 must initially not be checked')
  await node2Option.click()
  assert.deepEqual(selectedProxy, { group: 'PROXY', proxy: 'Node 2' }, 'Proxy node selection must be sent to kernel')

  fullService.updateContextMenu()
  const updatedGroup = currentTray.menu.find(item => item.label?.startsWith('PROXY'))
  assert.equal(updatedGroup.submenu.find(item => item.label === 'Node 2').checked, true, 'Node 2 must now be checked')

  // Click Global mode and verify inner group selection in GLOBAL group
  const globalOption = modeItem.submenu.find(i => i.label === 'Глобальный')
  await globalOption.click()
  assert.equal(testSettings.kernel.mode, 'global', 'Mode must switch to global')
  fullService.updateContextMenu()
  assert.deepEqual(trayGroupNames(), ['GLOBAL', 'PROXY', 'Zulu', 'Alpha', 'Extra'], 'Global mode must keep GLOBAL first and retain provider order')
  const globalGroup = currentTray.menu.find(item => item.label?.startsWith('GLOBAL'))
  assert.ok(globalGroup, 'GLOBAL group must be present in global mode')
  const innerProxyOption = globalGroup.submenu.find(item => item.label === 'PROXY')
  assert.ok(innerProxyOption, 'Inner group PROXY must exist in GLOBAL group')
  assert.equal(innerProxyOption.checked, true, 'Inner group PROXY must be checked')
  await fullService.dispose()

  // Verify Profiles menu when ProfileService is provided
  const testProfiles = [
    { id: 'sub-1', name: 'Profile One' },
    { id: 'sub-2', name: 'Profile Two' }
  ]
  let activeProfileId = 'sub-1'
  const mockProfileService = {
    getProfiles: () => testProfiles,
    getActiveProfile: () => testProfiles.find(p => p.id === activeProfileId),
    setActiveProfile: async id => { activeProfileId = id }
  }
  const profileTrayService = new TrayService(
    testWinService,
    testKernel,
    { getStatus: () => ({ enabled: false }), setSysProxy: async () => {} },
    testSettingService,
    { setRoutingMode: async () => {} },
    mockProfileService
  )
  await profileTrayService.initialize()
  profileTrayService.updateContextMenu()
  const profilesMenu = currentTray.menu.find(item => item.label?.startsWith('Профили'))
  assert.ok(profilesMenu, 'Profiles menu item must exist')
  assert.equal(profilesMenu.submenu.length, 2, 'Must have 2 profile options')
  assert.equal(profilesMenu.submenu.find(i => i.label === 'Profile One').checked, true)
  assert.equal(profilesMenu.submenu.find(i => i.label === 'Profile Two').checked, false)
  await profilesMenu.submenu.find(i => i.label === 'Profile Two').click()
  assert.equal(activeProfileId, 'sub-2', 'Selecting profile in tray must update active profile')
  profileTrayService.updateContextMenu()
  const updatedProfilesMenu = currentTray.menu.find(item => item.label?.startsWith('Профили'))
  assert.equal(updatedProfilesMenu.submenu.find(i => i.label === 'Profile Two').checked, true)
  // Verify menu structure order
  assert.equal(currentTray.menu[0].label, 'Открыть приложение', 'First item must be Open window')
  assert.equal(currentTray.menu[1].label, 'Отключить', 'Second item must be Connect/Disconnect')
  assert.equal(currentTray.menu[2].type, 'separator', 'Separator before profiles')
  assert.ok(currentTray.menu[3].label?.startsWith('Профили'), 'Profiles section')
  assert.equal(currentTray.menu[4].type, 'separator', 'Separator before selectors')
  assert.ok(currentTray.menu[5].label?.startsWith('GLOBAL'), 'Selectors section starts')
  const routingModeIdx = currentTray.menu.findIndex(i => i.label?.startsWith('Режим маршрутизации'))
  assert.ok(routingModeIdx > 5, 'Routing mode comes after selectors')
  assert.equal(currentTray.menu[routingModeIdx - 1].type, 'separator', 'Separator before routing mode')
  assert.equal(currentTray.menu[routingModeIdx + 1].type, 'separator', 'Separator after routing mode')
  const sysProxyIdx = currentTray.menu.findIndex(i => i.label?.startsWith('Системный прокси'))
  const coreOnlyIdx = currentTray.menu.findIndex(i => i.label === 'Только ядро')
  assert.ok(sysProxyIdx > routingModeIdx, 'Additional settings (proxy) at bottom section')
  assert.ok(coreOnlyIdx > routingModeIdx, 'Additional settings (core only) at bottom section')
  const restartIdx = currentTray.menu.findIndex(i => i.label === 'Перезапустить ядро')
  assert.equal(currentTray.menu[restartIdx - 1].type, 'separator', 'Separator before restart/quit')

  await profileTrayService.dispose()

  console.log('PASS: VPN state, rounded transparent corners, four colors, DPI scales and live tray updates')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
