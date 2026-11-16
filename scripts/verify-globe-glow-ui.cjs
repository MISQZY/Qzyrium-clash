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
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    try {
      win.showInactive()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.querySelector('.globe-canvas')?.dataset.globeReady === 'true'`)) break
        await delay(50)
      }
      await evaluate('document.fonts.ready')
      await win.webContents.insertCSS('.globe-route-layer { visibility: hidden !important; }')
      await delay(500)
      const bounds = await evaluate(`(() => {
        const surface = document.querySelector('.globe-solid-surface').getBoundingClientRect();
        const canvas = document.querySelector('.globe-canvas');
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const scene = canvas.getBoundingClientRect();
        const sx = canvas.width / scene.width, sy = canvas.height / scene.height;
        const cx = surface.x + surface.width / 2, cy = surface.y + surface.height / 2, radius = surface.width / 2;
        let transparent = 0, total = 0;
        for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
          if (Math.hypot(x / sx + scene.x - cx, y / sy + scene.y - cy) > radius * .8) continue;
          total++; if (data[(y * canvas.width + x) * 4 + 3] === 0) transparent++;
        }
        return { cx, cy, radius, width: innerWidth, transparentFraction: transparent / total };
      })()`)
      assert.ok(bounds.transparentFraction > 0.3 && bounds.transparentFraction < 1, 'surface has visible land and transparent oceans')
      const styles = await evaluate(`(() => {
        const surface = document.querySelector('.globe-solid-surface');
        return { background: getComputedStyle(surface).backgroundImage, atmosphere: getComputedStyle(surface, '::before').content };
      })()`)
      assert.equal(styles.background, 'none', 'sphere background has no radial shading')
      assert.ok(['none', 'normal'].includes(styles.atmosphere), 'no atmosphere ring overlays the globe')
      fs.writeFileSync(path.join(output, 'software-globe.png'), (await win.webContents.capturePage()).toPNG())
      console.log('PASS: uniform globe surface, no atmosphere rings and transparent oceans in software rendering')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
