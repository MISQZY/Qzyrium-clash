// Visual/interaction regression using the isolated fixture, without a VPN core.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const output = path.resolve(__dirname, '../artifacts/globe-ui-check')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
app.commandLine.appendSwitch('force-device-scale-factor', process.env.UI_DISPLAY_SCALE || '1')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1040, height: 720,
    webPreferences: { preload: path.resolve(__dirname, 'verify-ui.cjs'), sandbox: false, contextIsolation: true, backgroundThrottling: false } })
  win.showInactive()
  const evaluate = async code => {
    try { return await win.webContents.executeJavaScript(code) }
    catch (error) { throw new Error(`Failed: ${code}`, { cause: error }) }
  }
  const waitFor = async code => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(code)) return
      await delay(50)
    }
    throw new Error(`Timed out: ${code}`)
  }
  const screenshot = async name => fs.writeFileSync(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG())
  try {
    await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
    await waitFor(`document.querySelector('.globe-route-endpoint') && document.querySelector('.globe-route-origin')`)
    await evaluate('document.fonts.ready')
    await delay(1000)
    for (let rotation = 0; rotation < 4; rotation++) {
      assert.ok(await evaluate(`(() => {
        const canvas = document.querySelector('.globe-canvas'), ctx = canvas.getContext('2d');
        const sx = canvas.width / canvas.clientWidth, sy = canvas.height / canvas.clientHeight;
        return Array.from(document.querySelectorAll('.globe-route-origin, .globe-route-endpoint')).every(marker => {
          const x = Number(marker.getAttribute('cx')) * sx, y = Number(marker.getAttribute('cy')) * sy;
          const pixels = ctx.getImageData(Math.floor(x) - 1, Math.floor(y) - 1, 3, 3).data;
          return Array.from(pixels).some((value, index) => index % 4 === 3 && value > 0);
        });
      })()`), 'markers align with painted land samples after rotating')
      await evaluate(`document.querySelector('.globe-scene').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
      await delay(100)
    }
    assert.ok(await evaluate(`document.querySelector('.globe-route-origin title').textContent.includes('Moscow')`), 'source location is available in the origin tooltip')
    await screenshot('connected')
    await evaluate(`document.querySelector('.overview-power').click()`)
    await waitFor(`document.querySelector('.overview-power').getAttribute('aria-pressed') === 'false'`)
    await waitFor(`!document.querySelector('.globe-route-track, .globe-route-origin, .globe-route-endpoint, .globe-route-summary, .globe-pending-node')`)
    await screenshot('disconnected')
    await evaluate(`document.querySelector('.sidebar-link[aria-label="Settings"]').click()`)
    await waitFor(`document.querySelector('h1')?.textContent === 'Settings'`)
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.setting-row')).every(el => getComputedStyle(el).borderBottomWidth === '0px')`), 'settings have no loose row dividers')
    assert.ok(await evaluate(`['.workspace-header', '.sidebar-header', '.sidebar-footer'].every(selector => { const style = getComputedStyle(document.querySelector(selector)); return style.borderTopWidth === '0px' && style.borderBottomWidth === '0px'; })`), 'shell has no loose decorative dividers')
    await screenshot('settings')
    console.log('PASS: markers match painted surface dots, source tooltip, disconnected globe, decorative dividers; screenshots in artifacts/globe-ui-check')
  } finally { win.destroy(); app.quit() }
}).catch(error => { console.error(error); app.exit(1) })
