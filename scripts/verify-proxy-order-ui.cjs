const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const getProxies = api.mihomo.getProxies
    api.mihomo.getProxies = async () => {
      const proxies = await getProxies()
      const group = (name, all, hidden = false) => ({ ...proxies.PROXY, name, all, hidden })
      // API map order, rule order and nested-group order deliberately differ
      // from the provider's configured PROXY, Zulu, Alpha sequence.
      return {
        Alpha: group('Alpha', ['PROXY']),
        ...proxies,
        PROXY: group('PROXY', ['Alpha', 'Zulu', ...proxies.PROXY.all]),
        Hidden: group('Hidden', [], true),
        Unused: group('Unused', []),
        Zulu: group('Zulu', ['PROXY']),
        GLOBAL: group('GLOBAL', ['PROXY', 'Zulu', 'Alpha', 'Hidden', 'Unused'])
      }
    }
    api.mihomo.getRules = async () => [
      { type: 'DomainSuffix', payload: 'example.com', proxy: 'Alpha' },
      { type: 'MATCH', payload: '', proxy: 'PROXY' }
    ]
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  app.setPath('userData', path.resolve(__dirname, '../artifacts/proxy-order-ui-check/user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720,
      webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const waitFor = async code => {
      for (let i = 0; i < 120; i++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    const groupNames = () => evaluate(`Array.from(document.querySelectorAll('.page-viewport [aria-expanded] .font-semibold.text-sm')).map(el => el.textContent)`)
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`!!document.querySelector('[aria-label="Proxy groups"]')`)
      await evaluate(`document.querySelector('[aria-label="Proxy groups"]').click()`)
      await waitFor(`document.querySelectorAll('.page-viewport [aria-expanded]').length === 4`)
      assert.deepEqual(await groupNames(), ['PROXY', 'Zulu', 'Alpha', 'Unused'], 'provider order wins over API map order and cyclic nested selectors; hidden groups stay filtered')
      await evaluate(`document.querySelector('.sidebar-mode[aria-label="Global"]').click()`)
      await waitFor(`document.querySelectorAll('.page-viewport [aria-expanded]').length === 5`)
      assert.deepEqual(await groupNames(), ['GLOBAL', 'PROXY', 'Zulu', 'Alpha', 'Unused'], 'global mode puts GLOBAL first and retains provider order')
      await evaluate(`document.querySelector('.sidebar-mode[aria-label="Rules"]').click()`)
      await waitFor(`document.querySelectorAll('.page-viewport [aria-expanded]').length === 4`)
      await evaluate(`document.querySelector('[aria-label="Home"]').click()`)
      await waitFor(`!!document.querySelector('.overview-power')`)
      await evaluate(`document.querySelector('.overview-power').click()`)
      await waitFor(`document.querySelector('.overview-power').getAttribute('aria-pressed') === 'false'`)
      await evaluate(`document.querySelector('[aria-label="Proxy groups"]').click()`)
      await waitFor(`document.querySelectorAll('.page-viewport [aria-expanded]').length === 4`)
      assert.deepEqual(await groupNames(), ['PROXY', 'Zulu', 'Alpha', 'Unused'], 'offline fallback retains provider order and hides hidden groups')
      console.log('PASS: provider group order survives nested cycles, API map order, global mode and offline fallback')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
