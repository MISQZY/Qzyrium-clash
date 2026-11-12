// Exercise the production sandboxed preload and Windows GPU lifecycle.
// No main services, user settings, proxy or VPN processes are touched.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const directory = path.resolve(__dirname, '../artifacts/process-model')
fs.mkdirSync(directory, { recursive: true })
app.setPath('userData', path.join(directory, 'user-data'))
if (process.argv.includes('--software')) app.disableHardwareAcceleration()
const { renderingSwitches } = require('./fixtures/rendering.cjs')
for (const [name, value] of renderingSwitches(process.platform, process.argv.includes('--low-memory'))) app.commandLine.appendSwitch(name, value)
const filename = path.join(directory, 'index.html')
fs.writeFileSync(filename, '<!doctype html><canvas width="64" height="64"></canvas>')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: {
    preload: path.resolve(__dirname, '../out/preload/index.js'),
    sandbox: true, contextIsolation: true
  } })
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await win.loadFile(filename)
      const result = await win.webContents.executeJavaScript(`(() => {
        const ctx = document.querySelector('canvas').getContext('2d');
        ctx.fillStyle = 'rgb(10, 20, 30)'; ctx.fillRect(0, 0, 64, 64);
        window.api.window.releaseUnusedMemory();
        return { pixel: [...ctx.getImageData(0, 0, 1, 1).data] };
      })()`)
      assert.deepEqual(result.pixel, [10, 20, 30, 255])
      const metrics = app.getAppMetrics()
      assert.ok(metrics.some(process => process.pid === win.webContents.getOSProcessId()), 'renderer stays isolated')
      if (process.platform === 'win32') {
        assert.ok(!metrics.some(metric => metric.type === 'GPU' && metric.pid !== process.pid),
          'GPU must not create a separate process/application group on Windows')
      } else {
        assert.ok(metrics.some(metric => metric.type === 'GPU' && metric.pid !== process.pid && metric.pid !== win.webContents.getOSProcessId()), 'GPU process stays isolated')
      }
      assert.ok(!(await win.webContents.capturePage()).isEmpty(), 'window still paints after cache release')
      if (!process.argv.includes('--software')) {
        assert.equal(app.getGPUFeatureStatus().gpu_compositing, 'enabled',
          'normal mode must retain GPU compositing for live Windows resizing')
      }
    }
    console.log('PASS: sandboxed production preload, canvas, cache release, reload, isolated renderer and platform GPU process policy')
  } finally {
    win.destroy()
    app.quit()
  }
}).catch(error => { console.error(error); app.exit(1) })
