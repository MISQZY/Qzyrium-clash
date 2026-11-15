// Isolated quota fixture; never starts a VPN core or changes system proxy settings.
const { app, BrowserWindow, contextBridge } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const info = { total: 1000, download: 100, upload: 0 }
    let reads = 0
    const getActive = api.profiles.getActive
    api.profiles.getActive = async () => ({ ...await getActive(), userInfo: info })
    const getStatus = api.kernel.getStatus
    api.kernel.getStatus = async () => localStorage.getItem('quota-test:status') ?? await getStatus()
    for (const [action, status] of [['start', 'running'], ['stop', 'stopped']]) {
      const original = api.kernel[action]
      api.kernel[action] = async () => { localStorage.setItem('quota-test:status', status); await original() }
    }
    const getConnections = api.mihomo.getConnections
    api.mihomo.getConnections = async () => {
      reads++
      const active = await api.profiles.getActive()
      const running = await api.kernel.getStatus() === 'running'
      return { ...(running ? await getConnections() : { downloadTotal: 0, uploadTotal: 0, connections: [] }),
        subscriptionTraffic: {
          key: JSON.stringify([active.id, active.lastFetchedAt ?? 0, info.upload, info.download, info.total, info.expire]),
          runtimeDeltaBytes: 200
        } }
    }
    expose('quotaTest', { getReads: () => reads })
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const directory = path.resolve('artifacts/subscription-traffic-ui')
  fs.mkdirSync(directory, { recursive: true })
  app.setPath('userData', directory)
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const usage = `document.querySelector('[data-subscription-usage] [role="progressbar"]')?.getAttribute('aria-valuenow')`
    const waitFor = async code => {
      for (let i = 0; i < 200; i++) {
        if (await evaluate(code)) return
        await delay(50)
      }
      throw new Error('Timed out: ' + code)
    }
    try {
      await win.loadFile(path.resolve('out/renderer/index.html'))
      await evaluate(`localStorage.removeItem('quota-test:status')`)
      await win.loadFile(path.resolve('out/renderer/index.html'))
      await waitFor(`${usage} === '30'`)
      const reads = await evaluate('window.quotaTest.getReads()')
      await evaluate('window.api.kernel.stop()')
      await waitFor(`document.querySelector('.overview-power')?.getAttribute('aria-pressed') === 'false'`)
      await waitFor(`window.quotaTest.getReads() > ${reads}`)
      await delay(150)
      assert.equal(await evaluate(usage), '30', 'stopping retains both server and runtime subscription usage')
      await evaluate(`document.querySelector('.sidebar-link[aria-label="Profiles"]').click()`)
      await waitFor(`!document.querySelector('.overview-power')`)
      await evaluate(`document.querySelector('.sidebar-link[aria-label="Home"]').click()`)
      await waitFor(`${usage} === '30'`)
      assert.equal(await evaluate(`document.querySelector('.overview-power').getAttribute('aria-pressed')`), 'false')
      await win.loadFile(path.resolve('out/renderer/index.html'))
      await waitFor(`${usage} === '30'`)
      assert.equal(await evaluate(`document.querySelector('.overview-power').getAttribute('aria-pressed')`), 'false',
        'renderer recreation restores subscription usage while the core remains stopped')
      const offlineReads = await evaluate('window.quotaTest.getReads()')
      await delay(2200)
      assert.equal(await evaluate('window.quotaTest.getReads()'), offlineReads, 'stopped cores do not enable periodic polling')
      console.log('PASS: subscription usage survives stop, navigation and renderer recreation without background polling')
    } finally { win.destroy() }
  }).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1) })
}
