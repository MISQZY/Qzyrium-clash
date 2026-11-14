// Actual Windows desktop pixels, not capturePage: catches presentation failures
// where the renderer has content but Windows displays a uniform gray window.
// Isolated UI fixture: no user settings, main services, VPN or proxy changes.
const { app, BrowserWindow, nativeImage } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const execute = promisify(execFile)
const { renderingSwitches } = require('./fixtures/rendering.cjs')
const compact = process.argv.includes('--low-memory')
const output = path.resolve(__dirname, '../artifacts/native-window-ui', compact ? 'compact' : 'normal')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
for (const [name, value] of renderingSwitches(process.platform, compact)) app.commandLine.appendSwitch(name, value)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  if (process.platform !== 'win32') { console.log('SKIP: native Windows presentation check'); app.quit(); return }
  const win = new BrowserWindow({ show: false, x: 20, y: 20, width: 1040, height: 720,
    titleBarStyle: 'hidden', titleBarOverlay: { height: 36, color: '#00000000', symbolColor: '#9ca3af' },
    webPreferences: { preload: path.resolve(__dirname, 'verify-ui.cjs'), sandbox: false, contextIsolation: true } })
  const report = []
  const ready = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await win.webContents.executeJavaScript('!!document.querySelector(".overview-panel")')) return
      await delay(100)
    }
    throw Error('Home page did not load')
  }
  const capture = async stage => {
    await win.webContents.executeJavaScript(`(() => {
      if (document.querySelector('#native-probes')) return;
      const probes = document.createElement('div'); probes.id = 'native-probes';
      const styles = ['top:64px;left:12px;background:#ff0000', 'top:64px;right:12px;background:#00ff00',
        'bottom:12px;left:12px;background:#0000ff', 'bottom:12px;right:12px;background:#ffff00'];
      probes.innerHTML = styles.map(style => '<div style="position:fixed;width:16px;height:16px;z-index:2147483647;'+style+'"></div>').join('');
      document.body.append(probes);
    })()`)
    win.focus()
    await delay(500)
    const handle = win.getNativeWindowHandle().readBigUInt64LE().toString()
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-File', path.resolve(__dirname, 'fixtures/capture-native-window.ps1'), handle, path.join(output, `${stage}.png`)
    ], { windowsHide: true, timeout: 15000 })
    const result = JSON.parse(stdout)
    report.push({ stage, ...result })
    assert.ok(result.colors > 32, `${stage}: native window is blank (${result.colors} sampled colors)`)
    const size = await win.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight })')
    const bitmap = nativeImage.createFromPath(path.join(output, `${stage}.png`)).toBitmap()
    const positions = [[20, 72, [0, 0, 255]], [size.width - 20, 72, [0, 255, 0]],
      [20, size.height - 20, [255, 0, 0]], [size.width - 20, size.height - 20, [0, 255, 255]]]
    for (const [x, y, expected] of positions) {
      const px = Math.round(x * result.width / size.width), py = Math.round(y * result.height / size.height)
      const actual = [...bitmap.subarray((py * result.width + px) * 4, (py * result.width + px) * 4 + 3)]
      assert.ok(actual.every((channel, index) => expected[index] ? channel > 170 : channel < 120),
        `${stage}: native UI must paint at ${x},${y}: expected ${expected}, got ${actual}`)
    }
    assert.equal(app.getGPUFeatureStatus().gpu_compositing, 'enabled', 'GPU compositing remains enabled')
    assert.ok(!app.getAppMetrics().some(metric => metric.type === 'GPU' && metric.pid !== process.pid),
      'no separate GPU process that could appear as another application group')
    console.log(`PASS: ${stage}: native window has ${result.colors} sampled colors`)
  }
  try {
    await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
    await ready()
    win.showInactive(); win.focus()
    console.log('GRAPHICS:', JSON.stringify({ requestedBackend: process.env.UI_ANGLE ?? 'default',
      features: app.getGPUFeatureStatus(), info: await app.getGPUInfo('basic') }))
    await capture('startup')
    win.setSize(940, 660)
    await capture('resize')
    const drag = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-File', path.resolve(__dirname, 'fixtures/drag-native-window.ps1'),
      win.getNativeWindowHandle().readBigUInt64LE().toString(), output,
      String(await win.webContents.executeJavaScript('devicePixelRatio'))
    ], { windowsHide: true, timeout: 30000 })
    const samples = JSON.parse(drag.stdout)
    fs.writeFileSync(path.join(output, 'drag.json'), JSON.stringify(samples, null, 2))
    assert.ok(new Set(samples.map(sample => sample.width)).size > 1, 'native drag must resize the window')
    for (const sample of samples) {
      const expected = [0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255]
      assert.ok(sample.colors.every((value, index) => expected[index] ? value > 170 : value < 120),
        `native drag ${sample.step}: UI must fill all four corners: ${sample.colors}`)
    }
    win.setSize(1280, 860)
    await capture('grow')
    win.hide(); await delay(100); win.showInactive(); win.focus()
    await capture('hide-show')
    win.minimize(); await delay(100); win.restore()
    await capture('minimize-restore')
    win.reload(); await ready()
    await capture('reload')
    console.log('PASS: actual native Windows presentation, accelerated GPU and no separate GPU process')
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    win.destroy(); app.quit()
  }
}).catch(error => { console.error(error); app.exit(1) })
