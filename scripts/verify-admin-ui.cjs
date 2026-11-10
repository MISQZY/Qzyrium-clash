// Isolated UI regression: no real elevation, kernel or system proxy changes.
const { app, BrowserWindow, contextBridge } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let calls = 0
    const getSettings = api.settings.get
    api.settings.get = async () => {
      const settings = await getSettings()
      settings.general.language = 'ru'
      return settings
    }
    api.profiles.getList = async () => {
      throw new Error("Error invoking remote method 'kernel:start': Error: Для работы TUN требуются права администратора. Перезапустите приложение от имени администратора.")
    }
    api.app.restartAsAdmin = async () => {
      calls++
      await new Promise(resolve => setTimeout(resolve, 500))
      if (calls === 2) throw new Error('launch failed')
      return false
    }
    expose('adminTest', { calls: () => calls })
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/admin-ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const waitFor = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`document.querySelector('[role="alert"] button')?.textContent.includes('Перезапустить')`)
      assert.ok(await evaluate(`!document.querySelector('[role="alert"]').textContent.includes('kernel:start')`))
      for (const width of [1040, 760, 580]) {
        win.setSize(width, 720)
        await new Promise(resolve => setTimeout(resolve, 100))
        assert.ok(await evaluate(`(() => {
          const alert = document.querySelector('[role="alert"]');
          const a = alert.getBoundingClientRect();
          const page = document.querySelector('.page-viewport').getBoundingClientRect();
          const header = document.querySelector('.workspace-header').getBoundingClientRect();
          return getComputedStyle(alert).position === 'fixed' && alert.scrollWidth <= alert.clientWidth && a.top >= header.bottom && a.bottom <= innerHeight && a.right <= innerWidth && page.top <= header.bottom + 1;
        })()`), `alert overlays content without shifting the page at ${width}px`)
      }
      win.setSize(1040, 720)
      for (let attempt = 1; attempt <= 2; attempt++) {
        await evaluate(`document.querySelector('[role="alert"] button').click(); document.querySelector('[role="alert"] button').click()`)
        await waitFor(`document.querySelector('[role="alert"] button').disabled`)
        assert.equal(await evaluate('window.adminTest.calls()'), attempt)
        await waitFor(`!document.querySelector('[role="alert"] button').disabled && document.querySelector('[role="alert"]').textContent.includes('Перезапуск не выполнен')`)
      }
      await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, 'admin-error.png'), image.toPNG()))
      const pageBeforeDismiss = await evaluate(`document.querySelector('.page-viewport').getBoundingClientRect().toJSON()`)
      await evaluate(`document.querySelector('[role="alert"] button[aria-label]').click()`)
      await waitFor(`!document.querySelector('[role="alert"]')`)
      assert.deepEqual(await evaluate(`document.querySelector('.page-viewport').getBoundingClientRect().toJSON()`), pageBeforeDismiss)
      console.log('PASS: Russian admin error, clean message, responsive layout, pending state, duplicate clicks, cancellation, rejection, retry and dismiss')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
