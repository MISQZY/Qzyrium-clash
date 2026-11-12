// Isolated renderer fixture: never starts the real VPN or changes user preferences.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const output = path.resolve('artifacts/onboarding-ui-check')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 760, show: false, webPreferences: {
    preload: path.resolve('scripts/verify-ui.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false, offscreen: true,
    additionalArguments: ['--test-onboarding']
  } })
  const errors = []
  win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message) })
  const evaluate = async code => {
    try { return await win.webContents.executeJavaScript(code) }
    catch (error) { throw new Error(`${error.message}\nExpression: ${code}\nRenderer errors: ${errors.join('\n')}`, { cause: error }) }
  }
  async function waitFor(code) {
    for (let i = 0; i < 120; i++) { if (await evaluate(code)) return; await delay(50) }
    throw new Error(`Timed out: ${code}`)
  }
  const click = label => evaluate(`Array.from(document.querySelectorAll('.tour-card button')).find(el => el.textContent.trim() === ${JSON.stringify(label)})?.click()`)
  const poses = ['smirk', 'navigate', 'file', 'cool', 'guard', 'power', 'confused', 'navigate', 'peace']
  const gallery = { dark: [], light: [] }
  async function recordMascot(mode, index) {
    const snapshot = await evaluate(`(() => {
      const svg = document.querySelector('.tour-free-mascot .tour-mascot');
      const copy = svg.cloneNode(true), style = getComputedStyle(svg);
      copy.style.color = style.color;
      for (const key of ['fur-top', 'fur-bottom', 'paws', 'tag', 'ink', 'edge', 'visor', 'eye-white', 'glitch']) copy.style.setProperty('--mascot-' + key, style.getPropertyValue('--mascot-' + key));
      return { pose: svg.dataset.pose, svg: copy.outerHTML };
    })()`)
    assert.equal(snapshot.pose, poses[index], 'each tutorial step has its own pose')
    gallery[mode][index] = snapshot.svg
  }
  async function fits() {
    await delay(200)
    assert.ok(await evaluate(`(() => { const r = document.querySelector('.tour-card').getBoundingClientRect(); return r.left >= 0 && r.top >= document.querySelector('.app-titlebar').getBoundingClientRect().bottom && r.right <= innerWidth && r.bottom <= innerHeight })()`), 'card fits workspace below window controls')
    assert.ok(await evaluate(`(() => {
      const bar = document.querySelector('.app-titlebar').getBoundingClientRect();
      const layer = document.querySelector('.tour-layer');
      return layer.getBoundingClientRect().top >= bar.bottom && getComputedStyle(layer).clipPath === 'inset(0px)' && !!document.elementFromPoint(20, bar.bottom / 2)?.closest('.app-titlebar');
    })()`), 'all tutorial visuals are clipped below the title bar and the title bar remains interactive')
    assert.ok(await evaluate(`(() => {
      const mascot = document.querySelector('.tour-free-mascot');
      if (!mascot || document.querySelector('.tour-card .tour-mascot')) return false;
      const r = mascot.getBoundingClientRect(), bar = document.querySelector('.app-titlebar').getBoundingClientRect();
      const disjoint = el => { const b = el.getBoundingClientRect(); return r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom; };
      return r.top >= bar.bottom && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && disjoint(document.querySelector('.tour-card')) && (!document.querySelector('.tour-spotlight') || disjoint(document.querySelector('.tour-spotlight')));
    })()`), 'mascot is outside the card and spotlight, in free workspace')
    assert.ok(await evaluate(`document.querySelector('.tour-card').contains(document.activeElement)`), 'focus remains inside the tutorial')
  }
  try {
    await win.webContents.session.clearStorageData()
    await win.loadFile(path.resolve('out/renderer/index.html'))
    await waitFor(`document.querySelector('.tour-card h2')?.textContent === 'Welcome to Qzyrium'`)
    const initialPower = await evaluate(`document.querySelector('[data-tour="connect"]').getAttribute('aria-pressed')`)
    assert.equal(await evaluate(`localStorage.getItem('qzyrium:onboarding-shown')`), '1')
    await fits()
    const darkFur = await evaluate(`getComputedStyle(document.querySelector('.tour-mascot .tour-fur-top')).stopColor`)
    await evaluate(`document.documentElement.classList.remove('dark')`)
    await waitFor(`getComputedStyle(document.querySelector('.tour-mascot .tour-fur-top')).stopColor !== ${JSON.stringify(darkFur)}`)
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.tour-mascot .tour-fur-top')).stopColor`), darkFur, 'light theme changes the fur, not only the accent')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.tour-mascot')).getPropertyValue('--mascot-tag').trim()`), '#f9fafc', 'light theme uses a light nameplate')
    await fits()
    await evaluate(`document.documentElement.classList.add('dark')`)
    await recordMascot('dark', 0)
    assert.ok(await evaluate(`(() => { const r = document.querySelector('.tour-card').getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 })()`), 'welcome card is centered after the dialog portal mounts')
    await fs.promises.writeFile(path.join(output, 'welcome.png'), (await win.webContents.capturePage()).toPNG())

    // Quitting halfway through must not trigger another automatic run.
    await win.reload()
    await waitFor(`!!document.querySelector('[data-tour="connect"]')`)
    assert.equal(await evaluate(`!!document.querySelector('.tour-card')`), false)
    await evaluate(`document.querySelector('.sidebar-nav button[aria-label="Settings"]').click()`)
    await waitFor(`!!document.querySelector('[data-tour-restart]')`)
    await evaluate(`document.querySelector('[data-tour-restart]').click()`)
    await waitFor(`!!document.querySelector('.tour-card')`)
    await click('Skip')
    await waitFor(`!document.querySelector('.tour-card')`)
    await evaluate(`document.querySelector('.sidebar-nav button[aria-label="Settings"]').click()`)
    await waitFor(`!!document.querySelector('[data-tour-restart]')`)
    await evaluate(`document.querySelector('[data-tour-restart]').click()`)
    await waitFor(`!!document.querySelector('.tour-card')`)

    const targets = ['navigation', 'add-profile', 'proxies', 'capture', 'connect', 'routing', 'connections', 'restart-tour']
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['file://*/*'] }, (details, callback) => {
      if (/\/ProfilesPage-[^/]+\.js$/.test(details.url)) setTimeout(() => callback({}), 500)
      else callback({})
    })
    for (const [i, target] of targets.entries()) {
      if (target === 'add-profile') await evaluate(`(() => {
        window.__tourCard = document.querySelector('.tour-card');
        const r = window.__tourCard.getBoundingClientRect(); window.__tourPosition = { left: r.left, top: r.top };
      })()`)
      await click('Next')
      if (target === 'add-profile') {
        await delay(150)
        assert.ok(await evaluate(`(() => {
          const card = document.querySelector('.tour-card'), r = card.getBoundingClientRect();
          return card === window.__tourCard && r.left === window.__tourPosition.left && r.top === window.__tourPosition.top;
        })()`), 'loading a lazy page preserves the dialog node and position')
      }
      await waitFor(`!!document.querySelector('[data-tour="${target}"]') && !!document.querySelector('.tour-spotlight')`)
      await fits()
      await recordMascot('dark', i + 1)
      assert.ok(await evaluate(`document.querySelector('.tour-card').textContent.includes('Step ${i + 2} of ${poses.length}')`))
      if (target === 'add-profile') {
        await evaluate(`(() => {
          const r = document.querySelector('.tour-card').getBoundingClientRect(); window.__tourPosition = { left: r.left, top: r.top };
          document.querySelector('[data-tour="add-profile"]').style.transform = 'translateY(-8px)';
        })()`)
        await delay(400)
        assert.ok(await evaluate(`(() => { const r = document.querySelector('.tour-card').getBoundingClientRect(); return r.left === window.__tourPosition.left && r.top === window.__tourPosition.top })()`), 'late layout shifts update the spotlight without moving a safe card')
        await click('Back')
        await waitFor(`document.querySelector('.tour-card').textContent.includes('Step 2 of ${poses.length}')`)
        await click('Next')
        await waitFor(`!!document.querySelector('[data-tour="add-profile"]') && !!document.querySelector('.tour-spotlight')`)
      }
      if (target === 'connect') {
        assert.equal(await evaluate(`document.querySelector('[data-tour="connect"]').getAttribute('aria-pressed')`), initialPower, 'tutorial does not change the VPN state')
      }
    }
    await click('Got it')
    await waitFor(`!document.querySelector('.tour-card')`)

    // Switch the actual app language and verify the same tutorial on a small viewport.
    const language = require('../src/renderer/src/i18n/messages/en/networksettings.json').language
    await evaluate(`(() => { const select = Array.from(document.querySelectorAll('select')).find(el => el.getAttribute('aria-label') === ${JSON.stringify(language)}); select.value = 'ru'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await evaluate(`(() => { const select = document.querySelector('select[aria-label="Appearance"]'); select.value = 'light'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
    await waitFor(`document.documentElement.lang === 'ru' && document.documentElement.dataset.theme === 'light'`)
    win.setSize(840, 560)
    await evaluate(`document.querySelector('[data-tour-restart]').click()`)
    await waitFor(`document.querySelector('.tour-card h2')?.textContent === ${JSON.stringify(require('../src/renderer/src/i18n/messages/ru/app.json').tour_welcome_title)}`)
    await fits()
    await recordMascot('light', 0)
    const original = await evaluate(`getComputedStyle(document.querySelector('.tour-mascot')).color`)
    await evaluate(`document.documentElement.style.setProperty('--primary', '#d883ff')`)
    await waitFor(`getComputedStyle(document.querySelector('.tour-mascot')).color !== ${JSON.stringify(original)}`)
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.tour-mascot')).color`), original, 'mascot responds to the live theme accent')
    await delay(300)
    await fs.promises.writeFile(path.join(output, 'welcome-small-ru.png'), (await win.webContents.capturePage()).toPNG())
    for (let i = 0; i < targets.length; i++) {
      await click(require('../src/renderer/src/i18n/messages/ru/app.json').tourNext)
      await waitFor(`!!document.querySelector('[data-tour="${targets[i]}"]') && !!document.querySelector('.tour-spotlight')`)
      await fits()
      await recordMascot('light', i + 1)
    }
    await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor(`!document.querySelector('.tour-card')`)
    await win.reload()
    await waitFor(`!!document.querySelector('[data-tour="connect"]')`)
    assert.equal(await evaluate(`!!document.querySelector('.tour-card')`), false)
    assert.deepEqual(errors, [])
    const preview = new BrowserWindow({ width: 1040, height: 1120, useContentSize: true, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
    try {
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;font:13px system-ui;background:#11121a}.group{padding:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.dark{background:#11121a;color:#dce2ed}.light{background:#eff2f7;color:#363e50}.pose{text-align:center}.pose svg{display:block;width:200px;height:220px;margin:auto}.pose span{display:block;margin:6px}.tour-fur-top{stop-color:var(--mascot-fur-top)}.tour-fur-bottom{stop-color:var(--mascot-fur-bottom)}
      </style></head><body>${Object.entries(gallery).map(([mode, svgs]) => `<section class="group ${mode}">${svgs.map((svg, i) => `<div class="pose">${svg}<span>${poses[i]}</span></div>`).join('')}</section>`).join('')}</body></html>`
      const file = path.join(output, 'mascot-poses.html')
      await fs.promises.writeFile(file, html)
      await preview.loadFile(file)
      preview.webContents.setZoomFactor(0.8)
      await delay(300)
      await fs.promises.writeFile(path.join(output, 'mascot-poses.png'), (await preview.webContents.capturePage()).toPNG())
    } finally { preview.destroy() }
    console.log('PASS: first launch, interrupted launch, replay, skip, back, finish, Escape, all spotlights, focus, small window, RU/EN and theme accent')
  } finally { win.destroy() }
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
