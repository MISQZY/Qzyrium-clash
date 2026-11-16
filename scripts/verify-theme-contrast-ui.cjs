// Isolated renderer fixture: no VPN core, system proxy, or user settings.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const output = path.resolve(__dirname, '../artifacts/theme-contrast-ui-check')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
const { renderingSwitches } = require('./fixtures/rendering.cjs')
for (const [name, value] of renderingSwitches(process.platform)) app.commandLine.appendSwitch(name, value)
app.commandLine.appendSwitch('force-device-scale-factor', process.env.UI_DISPLAY_SCALE || '1')
app.commandLine.appendSwitch('force-prefers-reduced-motion', 'reduce')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1040, height: 720,
    webPreferences: { preload: path.resolve(__dirname, 'verify-ui.cjs'), sandbox: false, contextIsolation: true, backgroundThrottling: false } })
  // Let capturePage acquire its own visible surface; showInactive can leave a
  // window occluded and produce UnknownVizError on the Windows test desktop.
  const evaluate = code => win.webContents.executeJavaScript(code)
  const screenshot = async name => {
    const image = await win.webContents.capturePage()
    assert.ok(!image.isEmpty(), `${name}: screenshot must contain pixels`)
    fs.writeFileSync(path.join(output, `${name}.png`), image.toPNG())
  }
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
    await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
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
      assert.equal(await evaluate(`document.documentElement.style.colorScheme`), id === 'light' || id === 'contrast-sand' ? 'light' : 'dark', 'native controls follow theme switches')
      const ratios = await evaluate(`(() => {
        const probe = document.createElement('span'); document.body.append(probe);
        // The reduced-motion rule gives every element a short transition.
        // Read each color immediately, without interpolating from the previous one.
        probe.style.setProperty('transition', 'none', 'important');
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const samples = {};
        const read = key => { probe.style.color = 'var(' + key + ')'; ctx.clearRect(0,0,1,1); ctx.fillStyle = getComputedStyle(probe).color; ctx.fillRect(0,0,1,1); const rgb = [...ctx.getImageData(0,0,1,1).data].slice(0,3); samples[key] = { css: getComputedStyle(probe).color, rgb }; return rgb; };
        const lum = rgb => rgb.reduce((sum,v,i) => { v /= 255; return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126,.7152,.0722][i]; }, 0);
        const ratio = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
        const pairs = [['--foreground','--background'], ['--foreground','--card'], ['--foreground','--muted'], ['--card-foreground','--card'], ['--muted-foreground','--background'], ['--muted-foreground','--muted'], ['--primary-foreground','--primary'], ['--sidebar-foreground','--sidebar'], ['--accent-foreground','--accent']];
        const result = pairs.map(([fg,bg]) => ({fg,bg,ratio:ratio(read(fg),read(bg))}));
        for (const fg of ['--primary','--warning','--success','--destructive']) {
          const color = read(fg), card = read('--card'), tint = card.map((v,i) => v * .85 + color[i] * .15);
          result.push({fg,bg:'15% tinted card',ratio:ratio(color,tint)});
        }
        probe.remove(); return { pairs: result, samples };
      })()`)
      for (const pair of ratios.pairs) assert.ok(pair.ratio >= 4.5, `${id}: ${pair.fg} on ${pair.bg}: ${pair.ratio}; samples: ${JSON.stringify(ratios.samples)}`)
      await screenshot(`${id}-settings`)
      await evaluate(`document.querySelector('.sidebar-link[aria-label="Home"]').click()`)
      await waitFor(`document.querySelector('.globe-canvas')?.dataset.globeReady === 'true'`)
      for (const running of [true, false]) {
        if (await evaluate(`document.querySelector('.overview-power').getAttribute('aria-pressed') !== '${running}'`)) {
          await evaluate(`document.querySelector('.overview-power').click()`)
        }
        await waitFor(`document.querySelector('.overview-power').getAttribute('aria-pressed') === '${running}'`)
        await delay(1200)
        const land = await evaluate(`(() => {
          const canvas = document.querySelector('.globe-canvas');
          const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          let maxAlpha = 0, visiblePixels = 0;
          for (let i = 3; i < data.length; i += 4) {
            maxAlpha = Math.max(maxAlpha, data[i]);
            if (data[i] >= 128) visiblePixels++;
          }
          return { maxAlpha, visibleFraction: visiblePixels / (canvas.width * canvas.height) };
        })()`)
        // Dormant land intentionally uses 58% opacity (alpha ~148). Requiring
        // alpha 200 depended on overlapping dots, which vary with rasterization.
        // Check both visibility and coverage so a few opaque dots cannot pass.
        assert.ok(land.maxAlpha >= 128 && land.visibleFraction >= 0.005,
          `${id} ${running}: globe land must remain visible: ${JSON.stringify(land)}`)
        await screenshot(`${id}-${running ? 'connected' : 'disconnected'}`)
      }
    }
    await evaluate(`document.querySelector('.sidebar-link[aria-label="Settings"]').click()`)
    await waitFor(`!!document.querySelector('select[aria-label="Appearance"]')`)
    await evaluate(`Array.from(document.querySelectorAll('summary')).find(node => node.textContent.trim() === 'Custom themes').click()`)
    const readPacks = () => evaluate(`JSON.parse(localStorage.getItem('qzyrium:customThemeCache'))`)
    const importTheme = async pack => {
      await evaluate(`window.api.uiTest.setConfigFile(${JSON.stringify(JSON.stringify(pack))})`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(node => node.textContent.trim() === 'Upload theme').click()`)
      await waitFor(`document.querySelector('[role="alertdialog"]')?.textContent.includes('Theme already installed')`)
    }
    const chooseImport = async label => {
      await evaluate(`Array.from(document.querySelectorAll('[role="alertdialog"] button')).find(node => node.textContent.trim() === ${JSON.stringify(label)}).click()`)
      await waitFor(`!document.querySelector('[role="alertdialog"]') && !Array.from(document.querySelectorAll('button')).find(node => node.textContent.trim() === 'Upload theme')?.disabled`)
    }
    const updated = { id: 'CONTRAST-VIOLET', name: 'Updated Violet', mode: 'light', colors: { '--background': '#eef3fa', '--primary': '#245577' } }
    const before = await readPacks()
    await importTheme(updated)
    assert.deepEqual(await readPacks(), before, 'opening the conflict dialog does not save')
    await chooseImport('Cancel')
    assert.deepEqual(await readPacks(), before, 'cancel leaves themes unchanged')
    await importTheme(updated)
    await chooseImport('Create copy')
    const copied = await readPacks()
    assert.equal(copied.length, before.length + 1)
    assert.equal(copied.find(pack => pack.id === 'contrast-violet-2').name, 'Updated Violet (copy)')
    assert.deepEqual(copied.find(pack => pack.id === 'contrast-violet'), before.find(pack => pack.id === 'contrast-violet'), 'copy preserves the original')
    await evaluate(`(() => {
      const select = document.querySelector('select[aria-label="Appearance"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'contrast-violet');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`)
    await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
    await waitFor(`document.documentElement.dataset.theme === 'contrast-violet' && document.documentElement.style.colorScheme === 'dark'`)
    await importTheme(updated)
    await chooseImport('Update theme')
    await waitFor(`document.documentElement.dataset.theme === 'contrast-violet' && document.documentElement.style.colorScheme === 'light'`)
    const replaced = await readPacks()
    assert.equal(replaced.length, copied.length, 'replacement does not create another theme')
    assert.equal(replaced.find(pack => pack.id === 'contrast-violet').colors['--background'], '#eef3fa')
    assert.equal(await evaluate(`window.api.settings.get().then(settings => settings.general.theme)`), 'contrast-violet', 'active preference survives replacement')
    await screenshot('theme-import-replaced')
    console.log('PASS: theme contrast, switching, globe and import conflict dialog: cancel, copy and active theme replacement')
  } finally { win.destroy(); app.quit() }
}).catch(error => { console.error(error); app.exit(1) })
