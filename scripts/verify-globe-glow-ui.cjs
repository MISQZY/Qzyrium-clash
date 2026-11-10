// Isolated software-rendering regression; no real VPN or user settings.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

if (process.type === 'renderer') {
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/globe-glow-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: true, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      win.show(); win.focus()
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.querySelector('.globe-canvas')?.dataset.globeReady === 'true'`)) break
        await delay(50)
      }
      await evaluate('document.fonts.ready')
      await win.webContents.insertCSS('.globe-route-layer { visibility: hidden !important; } .globe-solid-surface::before { transition: none !important; }')
      await delay(500)
      const bounds = await evaluate(`(() => {
        const surface = document.querySelector('.globe-solid-surface').getBoundingClientRect();
        const canvas = document.querySelector('.globe-canvas');
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const scene = document.querySelector('.globe-scene').getBoundingClientRect();
        const sx = canvas.width / scene.width, sy = canvas.height / scene.height;
        const cx = surface.x + surface.width / 2, cy = surface.y + surface.height / 2, radius = surface.width / 2;
        let transparent = 0, total = 0;
        for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
          if (Math.hypot(x / sx + scene.x - cx, y / sy + scene.y - cy) > radius * .8) continue;
          total++; if (data[(y * canvas.width + x) * 4 + 3] === 0) transparent++;
        }
        return { cx, cy, radius, width: innerWidth, transparentFraction: transparent / total };
      })()`)
      assert.ok(bounds.transparentFraction > 0.3, 'oceans must remain transparent, without a colored canvas disk')
      const lit = await win.webContents.capturePage()
      fs.writeFileSync(path.join(output, 'software-glow.png'), lit.toPNG())
      await win.webContents.insertCSS('.globe-solid-surface::before { opacity: 0 !important; }')
      await delay(100)
      const unlit = await win.webContents.capturePage()
      const a = lit.toBitmap(), b = unlit.toBitmap(), size = lit.getSize(), scale = size.width / bounds.width
      let insideMax = 0, outerDifference = 0, outerCount = 0
      for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
        const radius = Math.hypot(x / scale - bounds.cx, y / scale - bounds.cy) / bounds.radius
        if (radius > 1.4) continue
        const i = (y * size.width + x) * 4
        const difference = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
        if (radius < 0.9) insideMax = Math.max(insideMax, difference)
        if (radius > 1.02 && radius < 1.3) { outerDifference += difference; outerCount++ }
      }
      assert.ok(insideMax <= 2, `atmosphere must not brighten the interior (difference ${insideMax})`)
      assert.ok(outerDifference / outerCount > 0.2, 'soft exterior glow must remain visible')
      console.log('PASS: software glow stays outside the sphere; transparent oceans and visible atmosphere')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
