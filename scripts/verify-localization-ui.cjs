// Uses the existing isolated API fixture; never changes the real core or proxy.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const catalogs = Object.fromEntries(['en', 'ru'].map(locale => [locale,
  Object.fromEntries(fs.readdirSync(path.resolve('src/renderer/src/i18n/messages', locale)).map(file => [
    path.basename(file, '.json'), require(path.resolve('src/renderer/src/i18n/messages', locale, file))
  ]))
]))
const output = path.resolve('artifacts/i18n-ui-check')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'user-data'))
app.whenReady().then(async () => {
  const errors = []
  const win = new BrowserWindow({ width: 1100, height: 760, show: false, webPreferences: {
    preload: path.resolve('scripts/verify-ui.cjs'), contextIsolation: true, sandbox: false
  } })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  win.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason))
  win.webContents.session.protocol.handle('https', () => new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#69b88a"/></svg>', { headers: { 'Content-Type': 'image/svg+xml' } }))
  const evaluate = code => win.webContents.executeJavaScript(code)
  async function waitFor(code) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(code)) return
      await delay(50)
    }
    throw new Error(`Timed out: ${code}`)
  }
  const clickText = text => evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === ${JSON.stringify(text)} || el.getAttribute('aria-label') === ${JSON.stringify(text)})?.click()`)
  async function navigate(locale, id) {
    const title = catalogs[locale].common[id]
    await clickText(title)
    await waitFor(`document.querySelector('h1')?.textContent === ${JSON.stringify(title)}`)
    assert.equal(await evaluate(`document.querySelector('[aria-current="page"]')?.textContent.trim()`), title)
  }
  async function changeLanguage(previous, next) {
    const label = catalogs[previous].networksettings.language
    await evaluate(`(() => {
      const select = document.querySelector('select[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']');
      select.value = ${JSON.stringify(next)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`)
    await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
    await waitFor(`document.documentElement.lang === ${JSON.stringify(next)} && document.querySelector('h1')?.textContent === ${JSON.stringify(catalogs[next].common.settings)}`)
  }
  try {
    await win.webContents.session.clearStorageData()
    await win.loadFile(path.resolve('out/renderer/index.html'))
    await waitFor(`document.querySelector('h1')?.textContent === ${JSON.stringify(catalogs.en.common.dashboard)}`)
    for (const locale of ['en', 'ru']) {
      for (const id of ['dashboard', 'proxies', 'profiles', 'connections', 'rules', 'logs', 'settings']) {
        await navigate(locale, id)
        if (id === 'profiles') {
          await clickText(catalogs[locale].profiles.addSubscription)
          await waitFor(`document.querySelector('[role="dialog"]') !== null`)
          assert.ok(await evaluate(`Array.from(document.querySelectorAll('input')).some(el => el.placeholder === ${JSON.stringify(catalogs[locale].profiles.importUrlPlaceholder)})`))
          await evaluate(`document.querySelector('[role="dialog"] button:has(.sr-only)')?.click()`)
          if (await evaluate(`!!document.querySelector('[role="dialog"]')`)) {
            await clickText(catalogs[locale].common.close)
          }
          await waitFor(`document.querySelector('[role="dialog"]') === null`)
        }
      }
      const network = catalogs[locale].networksettings
      await clickText(network.checkForUpdates)
      await waitFor(`document.body.innerText.includes(${JSON.stringify(network.latestVersionInstalled)})`)
      if (locale === 'en') {
        await changeLanguage('en', 'ru')
        assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(catalogs.ru.networksettings.latestVersionInstalled)})`), 'update status follows a live locale change')
        await changeLanguage('ru', 'en')
      }
      for (const id of ['sysproxy', 'tun', 'dns', 'sniffer', 'resources', 'mihomo']) {
        await navigate(locale, 'settings')
        await evaluate(`document.querySelector('[data-nav-target="${id}"]').click()`)
        await waitFor(`document.querySelector('h1')?.textContent === ${JSON.stringify(catalogs[locale].common[id])}`)
      }
      await navigate(locale, 'settings')
      if (locale === 'en') await changeLanguage('en', 'ru')
    }
    assert.deepEqual(errors, [], 'renderer errors')
    console.log('PASS: 13 pages and subscription dialog in RU/EN; live language changes, update status and placeholders; no renderer errors')
    win.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG())
    win.destroy()
    app.exit(1)
  }
}).catch(error => { console.error(error); app.exit(1) })
