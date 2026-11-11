const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

function loadShared(file) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { exports, require: name => loadShared(path.resolve(path.dirname(file), name + '.ts')) })
  return exports
}
const { bootAppearance } = loadShared(path.resolve('src/shared/appearance.ts'))
const windowScale = loadShared(path.resolve('src/main/utils/window-scale.ts'))

class FixtureWindow extends EventEmitter {
  constructor(options) { super(); this.visible = options.show ?? true; this.options = options }
  minimized = false
  webContents = Object.assign(new EventEmitter(), {
    session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
    getZoomFactor: () => this.zoomFactor ?? 1,
    setZoomFactor: factor => { this.zoomFactor = factor },
    send() {}, setWindowOpenHandler() {}
  })
  isDestroyed() { return false }
  getContentSize() { return [this.options.width, this.options.height] }
  isVisible() { return this.visible }
  isMinimized() { return this.minimized }
  loadFile() {}
  setBackgroundColor(color) { this.backgroundColor = color }
  setTitleBarOverlay() {}
  hide() { this.visible = false; this.emit('hide') }
  show() { this.visible = true; this.emit('show') }
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
  '@shared/ipc': { IPC_CHANNELS: { EVENT_WINDOW_VISIBILITY: 'visibility' } },
  '@shared/appearance': { bootAppearance },
  '../utils/window-scale': windowScale,
  '../utils/memory': { trimProcessMemory: async () => {} }
}
const code = ts.transpileModule(fs.readFileSync('src/main/services/WindowService.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText
const exportsObject = {}
vm.runInNewContext(code, {
  exports: exportsObject,
  require: name => dependencies[name] ?? require(name),
  process: { platform: 'linux', env: {} },
  __dirname, setTimeout() {}
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
      win.webContents.emit('did-finish-load')
      assert.equal(win.isVisible(), false, 'document loading alone does not reveal an unpainted window')
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
      assert.equal(prevented, minimizeToTray)
      assert.equal(win.isVisible(), !minimizeToTray)
      const previousQuitCalls = quitCalls
      service.close()
      assert.equal(quitCalls - previousQuitCalls, minimizeToTray ? 0 : 1)
    }
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
  console.log('PASS: first-paint window presentation, custom theme backgrounds, silent startup, minimize, restore and close in all routing modes')
})().catch(error => { console.error(error); process.exitCode = 1 })
