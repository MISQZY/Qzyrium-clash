const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

function loadShared(file, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { exports, require: name => loadShared(path.resolve(path.dirname(file), name + '.ts')), ...globals })
  return exports
}
const { bootAppearance } = loadShared(path.resolve('src/shared/appearance.ts'))
let clock = 10000
let cursor = { x: 0, y: 0 }
const windowScale = loadShared(path.resolve('src/main/utils/window-scale.ts'), { process: { platform: 'win32' },
  require: name => name === 'electron' ? { screen: { getCursorScreenPoint: () => ({ ...cursor }) } } : require(name),
  setTimeout, clearTimeout, Date: class extends Date { static now() { return clock } } })

class FixtureWindow extends EventEmitter {
  constructor(options) { super(); this.visible = options.show ?? true; this.options = options }
  minimized = false
  webContents = Object.assign(new EventEmitter(), {
    session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
    getZoomFactor: () => this.zoomFactor ?? 1,
    setZoomFactor: factor => { this.zoomFactor = factor },
    messages: [],
    send(channel, ...args) { this.messages.push({ channel, args }) }, setWindowOpenHandler() {}
  })
  isDestroyed() { return false }
  getContentSize() { return [this.options.width, this.options.height] }
  nativeHooks = new Map()
  hookWindowMessage(message, handler) { this.nativeHooks.set(message, handler) }
  getMinimumSize() { return [0, 0] }
  getMaximumSize() { return [0, 0] }
  isMaximized() { return false }
  getBounds() { return { x: this.options.x ?? 0, y: this.options.y ?? 0, width: this.options.width, height: this.options.height } }
  setBounds(bounds) { Object.assign(this.options, bounds); this.emit('resize') }
  isVisible() { return this.visible }
  isMinimized() { return this.minimized }
  loadFile() {}
  setBackgroundColor(color) { this.backgroundColor = color }
  setTitleBarOverlay() {}
  hide() { this.visible = false; this.emit('hide') }
  destroy() { this.visible = false; this.destroyed = true }
  show() { this.visible = true; this.emit('show') }
  showInactive() { this.show() }
  focus() {}
  minimize() { this.minimized = true; this.emit('minimize') }
  restore() { this.minimized = false; this.emit('restore') }
}

let quitCalls = 0
const dependencies = {
  electron: { app: { getAppPath: () => process.cwd(), quit: () => quitCalls++ }, nativeTheme: Object.assign(new EventEmitter(), { shouldUseDarkColors: true }), BrowserWindow: FixtureWindow },
  '@electron-toolkit/utils': { is: { dev: false } },
  '../utils/paths': {},
  '../utils/logger': { logger: { info() {}, warn() {}, error() {} } },
  '@shared/ipc': { IPC_CHANNELS: { EVENT_WINDOW_VISIBILITY: 'visibility', EVENT_IMPORT_PROFILE: 'import' } },
  '@shared/appearance': { bootAppearance },
  '../utils/window-scale': windowScale,
  '../utils/memory': { trimProcessMemory: async () => {} },
  '../utils/profile-import-queue': require('./fixtures/typescript.cjs').loadTypeScript('src/main/utils/profile-import-queue.ts')
}
const code = ts.transpileModule(fs.readFileSync('src/main/services/WindowService.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
const exportsObject = {}
vm.runInNewContext(code, {
  exports: exportsObject,
  require: name => dependencies[name] ?? require(name),
  process: { platform: 'linux', env: {} },
  __dirname, setImmediate, setTimeout() {}
})

;(async () => {
  for (const minimizeToTray of [false, true]) {
    for (const mode of ['rule', 'global', 'direct']) {
      const service = new exportsObject.WindowService({ getSettings: () => ({ general: { minimizeToTray }, kernel: { mode } }) })
      const visibility = []
      service.setVisibilityHandler(value => visibility.push(value))
      const win = await service.createWindow()
      assert.equal(win.webContents.getZoomFactor(), 1)
      for (const [width, height, expected] of [
        [2560, 1440, 1.33], [3840, 2160, 2], [5120, 2160, 2],
        [3840, 720, 1], [1920, 1080, 1], [1040, 720, 1]
      ]) {
        win.options.width = width
        win.options.height = height
        win.emit('resize')
        assert.equal(win.webContents.getZoomFactor(), expected, `responsive zoom at ${width}x${height}`)
      }
      assert.equal(win.isVisible(), false, 'window stays hidden before its first paint')
      const notifications = win.webContents.messages.length
      for (let event = 0; event < 1000; event++) win.emit('resize')
      assert.equal(win.webContents.messages.length, notifications, 'unchanged zoom must not flood preload/style observers during a long resize')
      win.webContents.emit('did-finish-load')
      assert.equal(win.webContents.messages.length, notifications + 1, 'a new document receives the current zoom even when its value is unchanged')
      assert.equal(win.isVisible(), false, 'document loading alone does not reveal an unpainted window')
      for (let event = 0; event < 100; event++) win.emit('will-resize')
      const initialZoom = win.webContents.getZoomFactor()
      win.options.width = 3840; win.options.height = 2160; win.emit('resize')
      assert.equal(win.webContents.getZoomFactor(), initialZoom, 'interactive resize defers zoom changes until the border is released')
      win.emit('resized')
      assert.equal(win.webContents.getZoomFactor(), 2)
      win.options.width = 1040; win.options.height = 720; win.emit('resize')
      clock += 1000
      let skipped = 0
      const first = { x: 4, y: 6, width: 990, height: 680 }
      const final = { x: 8, y: 10, width: 1003, height: 691 }
      win.emit('will-resize', { preventDefault() { skipped++ } }, first)
      assert.equal(skipped, 0)
      win.setBounds(first)
      clock += 4
      win.emit('will-resize', { preventDefault() { skipped++ } }, final)
      assert.equal(skipped, 1, 'rapid native events skip redundant surface allocation')
      assert.deepEqual(win.getBounds(), first)
      win.emit('resized')
      assert.deepEqual(win.getBounds(), final, 'release commits the exact final border position even when its intermediate event was skipped')
      win.setBounds({ x: 0, y: 0, width: 1040, height: 720 })
      cursor = { x: 1045, y: 725 }
      win.nativeHooks.get(0x0231)()
      clock += 1000
      cursor = { x: 1049, y: 727 }
      win.emit('will-resize', { preventDefault() {} }, { x: -6, y: 0, width: 1056, height: 728 }, { edge: 'bottom-right' })
      win.setBounds({ x: 0, y: 0, width: 1044, height: 722 })
      clock += 4
      cursor = { x: 1055, y: 730 }
      win.emit('will-resize', { preventDefault() {} }, { x: -6, y: 0, width: 1062, height: 731 }, { edge: 'bottom-right' })
      win.nativeHooks.get(0x0232)()
      assert.deepEqual(win.getBounds(), { x: 0, y: 0, width: 1050, height: 725 },
        'Windows invisible DWM borders must not shift the window or inflate its committed size')
      win.setBounds({ x: 0, y: 0, width: 1040, height: 720 })
      service.show()
      assert.equal(win.isVisible(), false, 'early tray activation waits for the first paint')
      win.emit('ready-to-show')
      assert.equal(win.isVisible(), true)
      service.minimize()
      assert.equal(win.isMinimized(), true)
      assert.equal(win.isVisible(), true, 'minimization must keep the taskbar entry')
      assert.equal(visibility.at(-1), false)
      service.show()
      assert.equal(win.isMinimized(), false)
      assert.equal(win.isVisible(), true)
      assert.equal(visibility.at(-1), true)
      let prevented = false
      win.emit('close', { preventDefault: () => { prevented = true } })
      assert.equal(prevented, true)
      assert.equal(win.isVisible(), !minimizeToTray)
      const previousQuitCalls = quitCalls
      service.close()
      assert.equal(quitCalls - previousQuitCalls, minimizeToTray ? 0 : 1)
    }
  }
  for (const closeAction of ['tray', 'quit', 'core-only']) {
    const service = new exportsObject.WindowService({ getSettings: () => ({ general: { closeAction, minimizeToTray: false } }) })
    const win = await service.createWindow()
    win.emit('ready-to-show')
    const before = quitCalls
    service.close()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(quitCalls - before, closeAction === 'quit' ? 1 : 0)
    assert.equal(service.isCoreOnlyMode(), closeAction === 'core-only')
    if (closeAction === 'core-only') assert.equal(win.destroyed, true, 'core-only close releases the renderer')
    if (closeAction === 'tray') assert.equal(win.isVisible(), false)
  }
  for (const [theme, mode, color] of [['custom-dark', 'dark', '#282638'], ['custom-light', 'light', '#eef3fa'], ['missing', undefined, undefined]]) {
    const packs = mode ? [{ id: theme, mode, colors: { '--background': color } }] : []
    const expected = color ?? bootAppearance('dark', 'en', [], true).backgroundColor
    const service = new exportsObject.WindowService({ getSettings: () => ({ general: { theme, language: 'en', silentStart: true } }) }, { listThemes: () => packs })
    await service.initialize()
    const win = service.getMainWindow()
    assert.equal(win.options.backgroundColor, expected, 'native surface uses the exact saved palette at construction')
    const argument = win.options.webPreferences.additionalArguments[0].split('=')[1]
    assert.equal(JSON.parse(decodeURIComponent(argument)).backgroundColor, expected)
    assert.equal(win.backgroundColor, expected, 'native background respects custom theme mode')
    win.emit('ready-to-show')
    assert.equal(win.isVisible(), false, 'silent startup stays in the tray after first paint')
    service.show()
    assert.equal(win.isVisible(), true)
  }
  const imports = new exportsObject.WindowService({ getSettings: () => ({ general: {} }) })
  imports.queueProfileImport('qzyrium://install-config?url=https%3A%2F%2Fexample.com%2Fsub')
  let current = imports.getMainWindow()
  assert.equal(current.webContents.messages.filter(message => message.channel === 'import').length, 0, 'new window does not receive imports before subscription')
  imports.importRendererReady()
  const request = current.webContents.messages.find(message => message.channel === 'import').args[0]
  imports.setCoreOnlyMode(true)
  imports.queueProfileImport('clash://install-config?url=https%3A%2F%2Fexample.com%2Fsecond')
  current = imports.getMainWindow()
  assert.equal(current.webContents.messages.filter(message => message.channel === 'import').length, 0, 'core-only replacement waits for its listener')
  imports.importRendererReady()
  assert.equal(current.webContents.messages.find(message => message.channel === 'import').args[0].id, request.id)
  imports.completeProfileImport(request.id)
  assert.equal(current.webContents.messages.filter(message => message.channel === 'import').length, 2)
  console.log('PASS: window presentation, close modes and queued imports across core-only renderer recreation')
})().catch(error => { console.error(error); process.exitCode = 1 })
