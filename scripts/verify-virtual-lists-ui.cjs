// Large isolated datasets: bounded DOM, scrolling, filtering and selection.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const nodes = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`Server ${i}`, { name: `Server ${i}`, type: 'VLESS', history: [] }]))
    const group = { name: 'PROXY', type: 'Selector', all: Object.keys(nodes), now: 'Server 0', history: [] }
    api.mihomo.getProxies = async () => ({ ...nodes, PROXY: group })
    api.mihomo.selectProxy = async (_, node) => { group.now = node }
    api.mihomo.getConnections = async () => ({ uploadTotal: 1, downloadTotal: 1, connections: Array.from({ length: 2000 }, (_, i) => ({
      id: String(i), metadata: { network: 'tcp', type: 'HTTP', host: `host-${i}.example`, processPath: `C:/app/process-${i}.exe` },
      upload: i, download: i, start: '2026-01-01T00:00:00Z', chains: ['PROXY'], rule: 'MATCH'
    })) })
    api.profiles.getRawConfig = async () => 'rules:\n' + Array.from({ length: 2000 }, (_, i) => `  - DOMAIN,rule-${i}.example,DIRECT\n`).join('')
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/virtual-lists-ui')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const wait = async code => {
      for (let n = 0; n < 100; n++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw Error(`Timed out: ${code}`)
    }
    const navigate = async label => {
      await evaluate(`document.querySelector('nav button[aria-label="${label}"]').click()`)
      await wait(`document.querySelector('h1')?.textContent === '${label}'`)
    }
    let failed = false
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await wait(`document.querySelector('nav button[aria-label="Connections"]')`)
      await navigate('Connections')
      await wait(`document.querySelector('[data-virtual-list="true"] [data-index]')`)
      assert.ok(await evaluate(`document.querySelectorAll('[data-index]').length < 100`), 'process DOM stays bounded for 2000 processes')
      await evaluate(`document.querySelector('.page-scroll').scrollTop = 1e8`)
      await wait(`document.querySelector('.page-scroll').textContent.includes('process-0.exe')`)
      await navigate('Proxy groups')
      await wait(`document.querySelector('[aria-expanded]')`)
      await evaluate(`document.querySelector('[aria-expanded="false"]')?.click()`)
      await wait(`document.querySelector('[data-virtual-list="true"] [data-index]')`)
      assert.ok(await evaluate(`document.querySelectorAll('button[aria-label^="Select"]').length < 100`), 'proxy DOM stays bounded')
      await evaluate(`document.querySelector('.page-scroll').scrollTop = 1e8`)
      await wait(`document.querySelector('button[aria-label*="Server 1999"]')`)
      await evaluate(`document.querySelector('button[aria-label*="Server 1999"]').click()`)
      await wait(`document.querySelector('button[aria-label*="Server 1999"]')?.getAttribute('aria-pressed') === 'true'`)
      await navigate('Profiles')
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await wait(`document.querySelector('[role="dialog"] [data-virtual-list="true"] [data-index]')`)
      assert.ok(await evaluate(`document.querySelectorAll('[role="dialog"] [draggable]').length < 100`), 'rule DOM stays bounded')
      await evaluate(`document.querySelector('[role="dialog"] [data-virtuoso-scroller]').scrollTop = 1e8`)
      await wait(`document.querySelector('[role="dialog"]').textContent.includes('rule-1999.example')`)
      await evaluate(`Array.from(document.querySelectorAll('[draggable]')).find(el => el.textContent.includes('rule-1999.example')).click()`)
      await wait(`document.querySelector('fieldset input')?.value === 'rule-1999.example'`)
      console.log('PASS: 2000 proxies, processes and rules keep a bounded DOM; final rows remain reachable and editable')
    } catch (error) {
      console.error(error)
      failed = true
    } finally { win.destroy(); app.exit(failed ? 1 : 0) }
  })
}
