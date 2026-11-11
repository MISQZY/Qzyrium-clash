// Isolated rules/navigation regression check. No real VPN or user settings.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const scopes = []
    const getRules = api.mihomo.getRules
    api.mihomo.getRules = async scope => {
      scopes.push(scope ?? 'full')
      return getRules(scope)
    }
    api.uiTest.getRuleScopes = async () => scopes.slice()
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const output = path.resolve(__dirname, '../artifacts/rules-ui')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const waitFor = async code => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(code)) return
        await delay(50)
      }
      throw Error(`Timed out: ${code}`)
    }
    const navigate = async name => {
      await evaluate(`Array.from(document.querySelectorAll('nav button')).find(el => el.textContent.trim() === '${name}' || el.getAttribute('aria-label') === '${name}').click()`)
      await waitFor(`document.querySelector('h1')?.textContent === '${name}'`)
    }
    const rows = `document.querySelectorAll('.rules-table tbody tr')`
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      win.showInactive()
      await waitFor(`document.querySelector('h1')?.textContent === 'Home'`)
      await waitFor(`window.api.uiTest.getRuleScopes().then(scopes => scopes.includes('summary'))`)
      await navigate('Rules')
      await waitFor(`${rows}.length === 100`)
      assert.equal(await evaluate(`${rows}[0].cells[0].textContent`), '1')
      assert.equal((await evaluate('window.api.uiTest.getRuleScopes()')).at(-1), 'full')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Next').click()`)
      await waitFor(`${rows}[0]?.cells[0].textContent === '101'`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Next').click()`)
      await waitFor(`${rows}.length === 10 && ${rows}[0].cells[0].textContent === '201'`)
      await evaluate(`{ const input = document.querySelector('[aria-label="Search rules"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'service-209'); input.dispatchEvent(new Event('input', { bubbles: true })); }`)
      await waitFor(`${rows}.length === 1 && ${rows}[0].cells[0].textContent === '210'`)
      await evaluate(`{ const select = document.querySelector('[aria-label="Rule type"]'); select.value = 'IPCIDR'; select.dispatchEvent(new Event('change', { bubbles: true })); }`)
      await waitFor(`${rows}.length === 0`)
      await navigate('Settings')
      await navigate('Rules')
      await waitFor(`${rows}.length === 100 && ${rows}[0].cells[0].textContent === '1'`)
      await navigate('Home')
      await waitFor(`window.api.uiTest.getRuleScopes().then(scopes => scopes.at(-1) === 'summary')`)
      console.log('PASS: dashboard summary requests, full rules loading, pagination, original indexes, search/type filtering and navigation reload')
    } finally {
      win.destroy()
      app.quit()
    }
  }).catch(error => { console.error(error); app.exit(1) })
}
