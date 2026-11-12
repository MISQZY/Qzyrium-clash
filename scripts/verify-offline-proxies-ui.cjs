const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let starts = 0, reads = 0
    api.kernel.getStatus = async () => 'stopped'
    api.kernel.getSessionStartedAt = async () => null
    api.kernel.start = async () => { starts++ }
    api.mihomo.getRules = async () => []
    const getProxies = api.mihomo.getProxies
    api.mihomo.getProxies = async () => { reads++; return getProxies() }
    expose('offlineTest', { stats: () => ({ starts, reads }) })
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/offline-proxies-ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = async code => {
      try { return await win.webContents.executeJavaScript(code) }
      catch (error) { throw new Error(`Failed: ${code}`, { cause: error }) }
    }
    const waitFor = async code => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`Boolean(${code})`)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`document.querySelector('[aria-label="Proxy groups"]')`)
      await evaluate(`document.querySelector('[aria-label="Proxy groups"]').click()`)
      await waitFor(`document.querySelectorAll('button[aria-label^="Select Node"]').length > 1`)
      assert.ok(await evaluate(`document.querySelector('.page-viewport').textContent.includes('VPN is off')`))
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('.page-viewport button')).find(button => Array.from(button.querySelectorAll('span:not([aria-hidden="true"])')).some(label => label.textContent.trim() === 'Test Latency')).disabled`), true)
      const target = await evaluate(`document.querySelectorAll('button[aria-label^="Select Node"]')[1].getAttribute('aria-label')`)
      await evaluate(`document.querySelectorAll('button[aria-label^="Select Node"]')[1].click()`)
      await waitFor(`Array.from(document.querySelectorAll('button[aria-label^="Select Node"]')).find(button => button.getAttribute('aria-label') === ${JSON.stringify(target)})?.getAttribute('aria-pressed') === 'true'`)
      assert.ok((await evaluate(`window.offlineTest.stats()`)).reads > 0)
      assert.equal((await evaluate(`window.offlineTest.stats()`)).starts, 0)
      assert.equal(await evaluate(`document.querySelector('[role="alert"]') !== null`), false)
      console.log('PASS: cold startup with VPN off loads groups, changes selected node and keeps VPN off; latency tests remain disabled')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
