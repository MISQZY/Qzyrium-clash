const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let calls = 0
    api.profiles.update = async () => {
      calls++
      await new Promise(resolve => setTimeout(resolve, 350))
      if (calls === 2) throw new Error('Subscription unavailable')
    }
    expose('workspaceTest', { calls: () => calls })
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/workspace-ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const waitFor = async code => {
      for (let i = 0; i < 160; i++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      const refresh = `document.querySelector('.workspace-header button[aria-label="Update Subscription"]')`
      await waitFor(`${refresh} && !${refresh}.disabled`)
      assert.equal(await evaluate(`document.querySelector('.workspace-header nav li:first-child svg')`), null)
      assert.ok(await evaluate(`!!document.querySelector('.workspace-header [aria-current="page"] svg')`))
      await evaluate(`${refresh}.click(); ${refresh}.click()`)
      await waitFor(`${refresh}.getAttribute('aria-busy') === 'true'`)
      await waitFor(`!${refresh}.disabled`)
      assert.equal(await evaluate('window.workspaceTest.calls()'), 1)
      await evaluate(`Array.from(document.querySelectorAll('nav button')).find(el => el.textContent.trim() === 'Settings' || el.getAttribute('aria-label') === 'Settings').click()`)
      await waitFor(`document.querySelector('h1')?.textContent === 'Settings' && document.querySelector('#general-autoStart')`)
      assert.equal(await evaluate(`document.querySelectorAll('#general-autoStart').length`), 1)
      for (const width of [1040, 840]) {
        win.setSize(width, 720)
        await new Promise(resolve => setTimeout(resolve, 100))
        assert.ok(await evaluate(`Array.from(document.querySelectorAll('form [data-slot], form input, form textarea, form select')).every(el => el.getBoundingClientRect().right <= innerWidth)`), `settings fit at ${width}px`)
      }
      await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, 'settings.png'), image.toPNG()))
      const before = await evaluate(`document.querySelector('.page-viewport').getBoundingClientRect().toJSON()`)
      await evaluate(`${refresh}.click()`)
      await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('Subscription unavailable')`)
      assert.deepEqual(await evaluate(`document.querySelector('.page-viewport').getBoundingClientRect().toJSON()`), before)
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[role="alert"]')).position`), 'fixed')
      await evaluate(`document.querySelector('[role="alert"] button').click()`)
      await waitFor(`!document.querySelector('[role="alert"]')`)
      console.log('PASS: header subscription refresh, duplicate clicks, failure notification, stable page layout and responsive settings')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
