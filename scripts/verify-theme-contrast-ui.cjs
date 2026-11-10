// Isolated renderer fixture: no VPN core, system proxy, or user settings.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const output = path.resolve(__dirname, '../artifacts/theme-contrast-ui-check')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1040, height: 720,
    webPreferences: { preload: path.resolve(__dirname, 'verify-ui.cjs'), sandbox: false, contextIsolation: true, backgroundThrottling: false } })
  win.showInactive()
  const evaluate = code => win.webContents.executeJavaScript(code)
  const waitFor = async code => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(code)) return
      await delay(50)
    }
    throw new Error(`Timed out: ${code}`)
  }
  const customThemes = [
    { id: 'contrast-sand', name: 'Sand', mode: 'light', colors: {
      '--background': '#f5eddf', '--card': '#fff8ee', '--sidebar': '#ede3d1',
      '--foreground': '#c8bda8', '--muted-foreground': '#c8bda8',
      '--primary': 'hsl(42 95% 75%)', '--primary-foreground': '#ffffee',
      '--warning': '#eecb75', '--success': '#b5d8ac'
    } },
    { id: 'contrast-violet', name: 'Violet', mode: 'dark', colors: {
      '--background': '#292437', '--card': '#342d45', '--sidebar': '#30283f',
      '--foreground': '#595065', '--muted-foreground': '#595065',
      '--primary': 'rgb(79 60 100)', '--primary-foreground': '#564767',
      '--warning': '#615021', '--success': '#25553e'
    } }
  ]
  try {
    await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
    await evaluate(`localStorage.setItem('qzyrium:customThemeCache', ${JSON.stringify(JSON.stringify(customThemes))})`)
    await win.reload()
    await waitFor(`!!document.querySelector('.overview-power')`)
    for (const id of ['dark', 'light', ...customThemes.map(theme => theme.id), 'dark']) {
      await evaluate(`document.querySelector('.sidebar-link[aria-label="Settings"]').click()`)
      await waitFor(`!!document.querySelector('select[aria-label="Appearance"]')`)
      await evaluate(`(() => {
        const select = document.querySelector('select[aria-label="Appearance"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(id)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`)
      await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
      await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(id)}`)
      await delay(250)
      const ratios = await evaluate(`(() => {
        const probe = document.createElement('span'); document.body.append(probe);
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const read = key => { probe.style.color = 'var(' + key + ')'; ctx.clearRect(0,0,1,1); ctx.fillStyle = getComputedStyle(probe).color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].slice(0,3); };
        const lum = rgb => rgb.reduce((sum,v,i) => { v /= 255; return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126,.7152,.0722][i]; }, 0);
        const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
        const pairs = [['--foreground','--background'], ['--foreground','--card'], ['--foreground','--muted'], ['--card-foreground','--card'], ['--muted-foreground','--background'], ['--muted-foreground','--muted'], ['--primary-foreground','--primary'], ['--sidebar-foreground','--sidebar'], ['--accent-foreground','--accent']];
        const result = pairs.map(([fg,bg]) => ({fg,bg,ratio:ratio(read(fg),read(bg))}));
        for (const fg of ['--primary','--warning','--success','--destructive']) {
          const color = read(fg), card = read('--card'), tint = card.map((v,i) => v * .85 + color[i] * .15);
          result.push({fg,bg:'15% tinted card',ratio:ratio(color,tint)});
        }
        probe.remove(); return result;
      })()`)
      for (const pair of ratios) assert.ok(pair.ratio >= 4.5, `${id}: ${pair.fg} on ${pair.bg}: ${pair.ratio}`)
      fs.writeFileSync(path.join(output, `${id}-settings.png`), (await win.webContents.capturePage()).toPNG())
      await evaluate(`document.querySelector('.sidebar-link[aria-label="Home"]').click()`)
      await waitFor(`document.querySelector('.globe-canvas')?.dataset.globeReady === 'true'`)
      for (const running of [true, false]) {
        if (await evaluate(`document.querySelector('.overview-power').getAttribute('aria-pressed') !== '${running}'`)) {
          await evaluate(`document.querySelector('.overview-power').click()`)
        }
        await waitFor(`document.querySelector('.overview-power').getAttribute('aria-pressed') === '${running}'`)
        await delay(1200)
        const maxAlpha = await evaluate(`(() => {
          const canvas = document.querySelector('.globe-canvas');
          const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          let max = 0; for (let i = 3; i < data.length; i += 4) max = Math.max(max,data[i]); return max;
        })()`)
        assert.ok(maxAlpha >= 200, `${id} ${running}: globe land must remain visible`)
        fs.writeFileSync(path.join(output, `${id}-${running ? 'connected' : 'disconnected'}.png`), (await win.webContents.capturePage()).toPNG())
      }
    }
    console.log('PASS: light/dark and low-contrast custom themes: readable text, tinted badges, theme switching, connected/disconnected globe')
  } finally { win.destroy(); app.quit() }
}).catch(error => { console.error(error); app.exit(1) })
