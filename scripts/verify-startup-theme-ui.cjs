// Real sandboxed preload, with renderer JS/CSS blocked and settings IPC delayed.
// Does not load the application main process or change user settings/proxy.
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const output = path.resolve(__dirname, '../artifacts/startup-theme-ui-check')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const pending = () => new Promise(() => {})
  let rendererReadyCalls = 0
  for (const [channel, handler] of Object.entries({
    'app:get-boot-snapshot': pending, 'app:get-settings': pending, 'theme:get-custom-themes': pending,
    'kernel:get-status': () => 'stopped', 'kernel:get-session-started-at': () => null,
    'kernel:get-rule-warning': () => null,
    'sysproxy:get-status': () => ({ enabled: false, mode: 'manual', port: 7895 }),
    'profile:get-list': () => [], 'profile:get-active': () => null,
    'app:get-updater-status': () => ({ state: 'unsupported' }), 'app:get-whats-new': () => null,
    'window:set-titlebar-overlay': () => {}, 'app:get-app-version': () => 'test',
    'app:import-renderer-ready': () => { rendererReadyCalls++ }
  })) ipcMain.handle(channel, handler)
  const errors = []
  for (const [mode, background, expected] of [['dark', '#282638', 'rgb(40, 38, 56)'], ['light', '#eef3fa', 'rgb(238, 243, 250)']]) {
    const theme = { id: `custom-${mode}`, name: 'Startup test', mode, colors: { '--background': background, '--foreground': mode === 'dark' ? '#eeeeee' : '#111111' }, titleBarOverlay: { color: '#00000000', symbolColor: '#888888' } }
    const boot = { preference: theme.id, language: 'ru', theme, backgroundColor: background }
    const win = new BrowserWindow({ show: false, backgroundColor: background, webPreferences: {
      preload: path.resolve(__dirname, '../out/preload/index.js'), sandbox: true, contextIsolation: true,
      additionalArguments: [`--qzyrium-appearance=${encodeURIComponent(JSON.stringify(boot))}`]
    } })
    win.webContents.on('preload-error', (_, file, error) => errors.push(`${file}: ${error.message}`))
    const evaluate = code => win.webContents.executeJavaScript(code)
    try {
      const url = path.resolve(__dirname, '../out/renderer/index.html')
      win.webContents.session.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => callback({ cancel: /\.(js|css)(?:\?|$)/.test(details.url) }))
      await win.loadFile(url)
      assert.equal(await evaluate(`getComputedStyle(document.documentElement).backgroundColor`), expected, 'saved background paints without renderer scripts or stylesheets')
      assert.equal(await evaluate(`document.documentElement.dataset.theme`), theme.id)
      assert.equal(await evaluate(`document.documentElement.lang`), 'ru')
      assert.equal(await evaluate(`!!window.api.bootAppearance`), true, 'actual sandboxed preload exposes the boot theme')
      win.webContents.session.webRequest.onBeforeRequest(null)
      await win.loadFile(url)
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`!!document.querySelector('.app-shell')`)) break
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      assert.equal(await evaluate(`!!document.querySelector('.app-shell')`), true)
      await new Promise(resolve => setTimeout(resolve, 300))
      assert.equal(await evaluate(`document.documentElement.dataset.theme`), theme.id, 'first React render preserves saved custom theme while settings/themes IPC are pending')
      assert.equal(await evaluate(`getComputedStyle(document.documentElement).backgroundColor`), expected)
    } finally { win.webContents.session.webRequest.onBeforeRequest(null); win.destroy() }
  }
  assert.deepEqual(errors, [])
  assert.ok(rendererReadyCalls >= 2, 'both rendered themes register the import listener through the real preload')
  console.log('PASS: real preload applies saved light/dark custom themes before CSS/JS and React preserves them without waiting for settings IPC')
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
