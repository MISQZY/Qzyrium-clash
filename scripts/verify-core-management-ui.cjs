const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const calls = []
    let info = { channel: 'stable', installedVersion: 'v1.0.0', stableInstalled: true, alphaInstalled: true }
    api.kernel.getCoreInfo = async () => info
    api.kernel.checkCoreUpdate = async channel => {
      calls.push(`check:${channel}`)
      return { state: 'available', version: 'v2.0.0', downloadUrl: 'https://example/core.zip' }
    }
    api.kernel.installCoreUpdate = async channel => {
      calls.push(`install:${channel}`)
      info = { ...info, channel, installedVersion: 'v2.0.0' }
      return info
    }
    api.kernel.switchChannel = async channel => {
      calls.push(`switch:${channel}`)
      info = { ...info, channel }
      return info
    }
    expose(name, api)
    expose('coreTest', { getCalls: () => calls })
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  app.setPath('userData', path.resolve('artifacts/core-management-ui/user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: {
      preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false
    } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const waitFor = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    try {
      await win.loadFile(path.resolve('out/renderer/index.html'))
      await waitFor(`document.querySelector('h1')?.textContent === 'Home'`)
      await evaluate(`document.querySelector('nav [aria-label="Settings"]').click()`)
      await waitFor(`!!document.querySelector('[data-nav-target="mihomo"]')`)
      await evaluate(`document.querySelector('[data-nav-target="mihomo"]').click()`)
      await waitFor(`!!document.querySelector('select[aria-label="Core Channel"]')`)
      await evaluate(`window.coreFormSubmits = 0; document.querySelector('#settings-mihomo').addEventListener('submit', () => window.coreFormSubmits++)`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Check for core updates')).click()`)
      await waitFor(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Download & Install'))`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Download & Install')).click()`)
      await waitFor(`window.coreTest.getCalls().includes('install:stable')`)
      assert.deepEqual(await evaluate('window.coreTest.getCalls()'), ['check:stable', 'install:stable'])
      assert.equal(await evaluate('window.coreFormSubmits'), 0, 'Installing a core must not submit settings')
      await waitFor(`!document.querySelector('select[aria-label="Core Channel"]').disabled`)
      await evaluate(`const select = document.querySelector('select[aria-label="Core Channel"]'); select.value = 'alpha'; select.dispatchEvent(new Event('change', { bubbles: true }))`)
      await waitFor(`window.coreTest.getCalls().includes('switch:alpha')`)
      assert.equal(await evaluate('window.coreFormSubmits'), 0)
      console.log('PASS: update downloads a new core, channel selection switches cores, neither action submits settings')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
