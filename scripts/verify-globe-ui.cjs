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
    const dragStart = await evaluate(`(() => {
      const scene = document.querySelector('.globe-scene'), rect = scene.getBoundingClientRect();
      for (let y = rect.top + 30; y < rect.bottom - 30; y += 30) {
        for (let x = rect.left + 30; x < rect.right - 30; x += 30) {
          const target = document.elementFromPoint(x, y);
          if (target === scene || target?.classList.contains('globe-solid-surface')) return { x: Math.round(x), y: Math.round(y) };
        }
      }
      throw new Error('No globe drag surface');
    })()`)
    win.webContents.sendInputEvent({ type: 'mouseMove', ...dragStart })
    await evaluate(`document.querySelector('.globe-route-hit').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`)
    await waitFor(`document.querySelector('.globe-route-glow')`)
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...dragStart })
    await waitFor(`!document.querySelector('.globe-route-glow')`)
    await evaluate(`document.querySelector('.globe-route-hit').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`)
    await delay(50)
    assert.equal(await evaluate(`!!document.querySelector('.globe-route-glow')`), false, 'capture cannot restore stale route hover while dragging')
    win.webContents.sendInputEvent({ type: 'mouseMove', x: dragStart.x + 20, y: dragStart.y + 10 })
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: dragStart.x + 20, y: dragStart.y + 10 })
    await delay(100)
    assert.equal(await evaluate(`!!document.querySelector('.globe-route-glow')`), false, 'route highlight is cleared after rotating')
    await evaluate(`document.querySelector('.globe-route-summary').click()`)
    await waitFor(`document.querySelector('.globe-route-glow')`)
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...dragStart })
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...dragStart })
    await delay(50)
    assert.ok(await evaluate(`document.querySelector('.globe-route-glow')`), 'explicitly pinned route survives dragging')
    await evaluate(`document.querySelector('.globe-route-summary').click()`)
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
    for (const [width, height] of [[840, 620], [1040, 720], [840, 480]]) {
      win.setSize(width, height)
      await delay(200)
      assert.ok(await evaluate(`(() => {
        const column = document.querySelector('.overview-panel-column');
        const rect = column.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth;
      })()`), `controls stay inside ${width}x${height}`)
      await evaluate(`document.querySelector('.overview-panel-column').scrollTop = 10000`)
      assert.ok(await evaluate(`(() => {
        const column = document.querySelector('.overview-panel-column');
        const last = column.lastElementChild.getBoundingClientRect();
        return last.bottom <= innerHeight;
      })()`), 'bottom of controls can be reached by scrolling')
    }
    win.setSize(1040, 720)
    await delay(200)
    await evaluate(`document.querySelector('.overview-power').click()`)
    await waitFor(`document.querySelector('.overview-power').getAttribute('aria-pressed') === 'false'`)
    await waitFor(`!document.querySelector('.globe-route-track, .globe-route-origin, .globe-route-endpoint, .globe-route-summary, .globe-pending-node')`)
    await screenshot('disconnected')
    await evaluate(`document.querySelector('.sidebar-link[aria-label="Settings"]').click()`)
    await waitFor(`document.querySelector('h1')?.textContent === 'Settings'`)
    assert.ok(await evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.setting-row'));
      return rows.length > 1 && rows.every(el => {
        const fieldsContinue = el.parentElement.matches('.settings-fields') && el.parentElement.nextElementSibling;
        const groupEnd = el.matches(':last-child') && !fieldsContinue;
        return getComputedStyle(el).borderBottomWidth === (groupEnd ? '0px' : '1px');
      });
    })()`), 'settings rows have dividers except at the end of each group')
    assert.ok(await evaluate(`(() => {
      const row = id => document.getElementById(id).closest('.setting-row');
      return getComputedStyle(row('general-autoStartAsAdmin')).borderBottomWidth === '1px'
        && getComputedStyle(row('general-silentStart')).borderBottomWidth === '0px';
    })()`), 'startup dividers continue past nested fields and stop after the final preference')
    assert.ok(await evaluate(`[
      ['.app-titlebar', 'borderBottomWidth'],
      ['.workspace-header', 'borderBottomWidth'],
      ['.sidebar-header', 'borderBottomWidth'],
      ['.sidebar-footer', 'borderTopWidth']
    ].every(([selector, border]) => getComputedStyle(document.querySelector(selector))[border] === '1px')`), 'titlebar, page header and sidebar dividers are visible')
    await screenshot('settings')
    console.log('PASS: markers match painted surface dots, source tooltip, disconnected globe, restored dividers; screenshots in artifacts/globe-ui-check')
  } finally { win.destroy(); app.quit() }
}).catch(error => { console.error(error); app.exit(1) })
