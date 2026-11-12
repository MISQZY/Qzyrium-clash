// Isolated UI fixture: no VPN core or system proxy changes.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const scale = {}
new Function('exports', 'require', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/main/utils/window-scale.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText)(scale, require)

const dpi = process.env.UI_DISPLAY_SCALE || '1'
if (process.env.UI_SOFTWARE === '1') app.disableHardwareAcceleration()
const { renderingSwitches } = require('./fixtures/rendering.cjs')
for (const [name, value] of renderingSwitches(process.platform, process.env.UI_LOW_MEMORY === '1')) app.commandLine.appendSwitch(name, value)
app.commandLine.appendSwitch('force-device-scale-factor', dpi)
app.setPath('userData', path.resolve(__dirname, `../artifacts/display-ui-check/dpi-${dpi}`))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1040, height: 720, titleBarStyle: 'hidden',
    titleBarOverlay: { height: 36, color: '#00000000', symbolColor: '#9ca3af' },
    webPreferences: { preload: path.resolve(__dirname, 'verify-ui.cjs'), sandbox: false, contextIsolation: true, backgroundThrottling: false }
  })
  scale.watchWindowScale(win)
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
  const navigate = async tab => {
    await evaluate(`document.querySelector('.sidebar-link[aria-label="${tab}"]').click()`)
    await waitFor(`document.querySelector('.workspace-header [aria-current="page"]').textContent.trim() === '${tab}' && document.querySelector('.page-heading')`)
    // Allow ResizeObserver and the globe's scheduled layout to finish before
    // measuring a newly mounted page at the new Chromium zoom.
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))')
  }
  const checkDialogBounds = async label => {
    const bounds = await evaluate(`(() => {
      const r = document.querySelector('[role="dialog"]').getBoundingClientRect();
      const title = document.querySelector('.app-titlebar').getBoundingClientRect();
      const overlay = document.querySelector('.app-dialog-overlay').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, titleBottom: title.bottom,
        overlayTop: overlay.top, width: innerWidth, height: innerHeight,
        centerY: (r.top + r.bottom) / 2 };
    })()`)
    assert.ok(bounds.top >= bounds.titleBottom + 15 && bounds.bottom <= bounds.height - 15,
      `${label} keeps its vertical margins below the native titlebar: ${JSON.stringify(bounds)}`)
    assert.ok(bounds.left >= 15 && bounds.right <= bounds.width - 15, `${label} keeps horizontal margins`)
    assert.ok(Math.abs(bounds.centerY - (bounds.height + bounds.titleBottom) / 2) < 2, `${label} centers in the workspace`)
    assert.ok(Math.abs(bounds.overlayTop - bounds.titleBottom) < 2, `${label} overlay starts below the titlebar`)
  }
  const closeDialog = async () => {
    await evaluate(`document.querySelector('[role="dialog"] button .sr-only').parentElement.click()`)
    await waitFor(`!document.querySelector('[role="dialog"]')`)
  }
  const checkFrame = async label => {
    const frame = await win.webContents.capturePage()
    const directory = path.resolve(__dirname, '../artifacts/display-ui-check', `dpi-${dpi}`)
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, `${label}.png`), frame.toPNG())
    assert.ok(!frame.isEmpty(), `${label} paints`)
    const bitmap = frame.toBitmap()
    // An opaque black frame used to pass the bottom-right alpha check. Sample
    // the whole surface so missing tiles and black windows cannot pass it.
    let missing = 0, samples = 0
    for (let offset = 0; offset < bitmap.length; offset += 4 * 13) {
      samples++
      if (bitmap[offset + 3] !== 255 || Math.max(bitmap[offset], bitmap[offset + 1], bitmap[offset + 2]) <= 2) missing++
    }
    assert.ok(missing / samples < 0.01, `${label} has black/transparent holes in ${missing}/${samples} sampled pixels`)
  }
  try {
    await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
    await waitFor(`document.querySelector('.overview-panel')`)
    // Show only after the UI is ready, avoiding an empty gray test window.
    // Windows needs a composited window for native titlebar overlay metrics.
    win.showInactive()
    // Include the CSS viewport of 4K at 200% system scaling and short ultrawide windows.
    for (const [width, height, zoom] of [[1040, 720, 1], [1920, 1080, 1], [2560, 1440, 1.33], [3840, 2160, 2], [3440, 720, 1], [840, 620, 1]]) {
      win.setContentSize(width, height)
      await delay(300)
      assert.ok(Math.abs(win.webContents.getZoomFactor() - zoom) < 0.02, `zoom at ${width}x${height}`)
      for (const tab of ['Home', 'Proxy groups', 'Profiles', 'Connections', 'Rules', 'Logs', 'Settings']) {
        await navigate(tab)
        const layout = await evaluate(`(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect();
          const main = rect('.page-viewport'), title = rect('.app-titlebar');
          const page = document.querySelector('.page-scroll') || document.querySelector('.page-viewport').firstElementChild;
          return { fits: main.right <= innerWidth + 2 && main.bottom <= innerHeight + 2,
            overflow: page.scrollWidth - page.clientWidth, titleHeight: title.height * ${win.webContents.getZoomFactor()} };
        })()`)
        assert.ok(layout.fits, `${tab} fits at ${width}x${height}`)
        assert.ok(layout.overflow <= 1, `${tab} has no horizontal overflow at ${width}x${height}: ${JSON.stringify(layout)}`)
        assert.ok(layout.titleHeight >= 35 && layout.titleHeight <= 40, `native titlebar retains its DIP height: ${layout.titleHeight} at ${width}x${height}`)
      }
      await navigate('Profiles')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Add Subscription')).click()`)
      await waitFor(`document.querySelector('[role="dialog"]')`)
      await checkDialogBounds(`subscription dialog at ${width}x${height}`)
      await closeDialog()
      await evaluate(`document.querySelector('[aria-label="More actions"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false }))`)
      await waitFor(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item => item.textContent.trim() === 'Edit file')`)
      await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Edit file').click()`)
      await waitFor(`document.querySelector('[role="dialog"] .cm-editor')`)
      await checkDialogBounds(`YAML editor at ${width}x${height}`)
      await closeDialog()
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`document.querySelector('[role="dialog"]')`)
      await checkDialogBounds(`rules editor at ${width}x${height}`)
      await closeDialog()
    }
    await navigate('Home')
    if (process.env.UI_SOFTWARE !== '1') {
      assert.equal(app.getGPUFeatureStatus().gpu_compositing, 'enabled', 'live resize needs normal GPU compositing')
    }
    // Exercise successive native sizes without waiting for the usual 300ms
    // settling period; inspect frames while growing and shrinking the window.
    for (let step = 0; step < 24; step++) {
      const progress = step < 12 ? step : 23 - step
      win.setContentSize(840 + progress * 64, 620 + progress * 24)
      await delay(16)
      if (step % 6 !== 0 && step !== 23) continue
      await checkFrame(`resize-${step}`)
      const viewport = await evaluate('({ width: innerWidth, height: innerHeight })')
      const [width, height] = win.getContentSize()
      const zoom = win.webContents.getZoomFactor()
      assert.ok(Math.abs(viewport.width * zoom - width) <= 2, `resize frame ${step} fills native width`)
      assert.ok(Math.abs(viewport.height * zoom - height) <= 2, `resize frame ${step} fills native height`)
    }
    win.maximize(); await delay(300)
    await checkFrame('maximized')
    win.unmaximize(); await delay(300)
    await checkFrame('unmaximized')
    win.minimize(); await delay(100)
    win.restore(); await delay(300)
    await checkFrame('restored')
    win.hide(); await delay(100)
    win.showInactive(); await delay(300)
    await checkFrame('shown-again')
    console.log(`PASS: display adaptation, seven pages, dialogs, native titlebar, rapid grow/shrink pixels, maximize/restore and hide/show (system scale ${dpi}, compact ${process.env.UI_LOW_MEMORY === '1'})`)
  } finally { win.destroy(); app.quit() }
}).catch(error => { console.error(error); app.exit(1) })
