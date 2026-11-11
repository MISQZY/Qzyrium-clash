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
  win.webContents.on('console-message', (event) => { const level = event.level; const message = event.message; if (level === 'error' || level >= 3) errors.push(message) })
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
    await changeLanguage('ru', 'en')
    win.setSize(840, 560)
    await delay(100)
    const disclosure = title => `Array.from(document.querySelectorAll('details')).find(el => el.querySelector('summary')?.textContent.trim() === ${JSON.stringify(title)})`
    const themes = disclosure('Custom themes')
    const localization = disclosure('Custom localization')
    assert.equal(await evaluate(`${themes}.open`), false)
    assert.equal(await evaluate(`${localization}.open`), false)
    assert.ok(await evaluate(`(() => {
      const trigger = document.querySelector('[role="combobox"][aria-label="Appearance"]');
      const row = trigger.closest('.setting-row'), text = row.firstElementChild.getBoundingClientRect(), control = trigger.getBoundingClientRect();
      return Math.abs(control.top + control.height / 2 - text.top - text.height / 2) < 2 && !row.querySelector('button:has(svg.lucide-download)');
    })()`), 'theme selector stays in the main row at the minimum window width')
    await evaluate(`${themes}.querySelector('summary').click()`)
    assert.ok(await evaluate(`${themes}.querySelectorAll('button').length >= 2`), 'theme file actions are inside the disclosure')
    await evaluate(`${localization}.querySelector('summary').click()`)
    await evaluate(`${localization}.querySelector('button').click()`)
    await waitFor(`!!window.api.uiTest.getSavedConfig()`)
    const exported = await evaluate(`JSON.parse(window.api.uiTest.getSavedConfig().content)`)
    for (const [namespace, messages] of Object.entries(catalogs.en)) {
      for (const key of Object.keys(messages)) assert.ok(Object.hasOwn(exported.messages[namespace], key), `${namespace}.${key} is in the example`)
    }
    assert.ok(exported.messages.native.quit && exported.messages.settingsfields['general.autoStart.label'])
    const pack = { id: 'custom-test', name: 'Test language', locale: 'de', baseLanguage: 'en', messages: {
      networksettings: { interfaceGroup: 'Custom interface' }, settingsfields: { 'general.autoStart.label': 'Custom startup' }
    } }
    await evaluate(`window.api.uiTest.setConfigFile(${JSON.stringify(JSON.stringify(pack))})`)
    await clickText('Upload localization')
    await waitFor(`!!document.querySelector('option[value="custom:custom-test"]')`)
    await evaluate(`(() => { const select = document.querySelector('select[aria-label="Interface language"]'); select.value = 'custom:custom-test'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
    await waitFor(`document.documentElement.lang === 'de' && document.body.innerText.includes('Custom interface')`)
    assert.ok(await evaluate(`document.body.innerText.includes('Custom startup')`), 'generated settings field keys are translated')
    assert.equal(await evaluate(`window.api.settings.get().then(settings => settings.general.customLocalization)`), pack.id)
    await navigate('en', 'dashboard')
    await navigate('en', 'settings')
    assert.ok(await evaluate(`document.body.innerText.includes('Custom interface')`), 'custom language survives navigation')
    assert.equal(await evaluate(`${localization}.open`), false, 'custom localization is collapsed on entry')
    await evaluate(`${localization}.querySelector('summary').click()`)
    await evaluate(`window.api.uiTest.setConfigFile(${JSON.stringify(JSON.stringify({ ...pack, messages: { connections: { sessions: { other: '{wrong} sessions' } } } }))})`)
    await clickText('Upload localization')
    await waitFor(`Array.from(document.querySelectorAll('[role="alert"]')).some(el => el.textContent.includes('Invalid localization file'))`)
    assert.equal(await evaluate(`document.querySelectorAll('option[value="custom:custom-test"]').length`), 1)
    await evaluate(`${localization}.querySelector('li button').click()`)
    await evaluate(`document.querySelector('button[form="settings-settings"]').click()`)
    await waitFor(`document.documentElement.lang === 'en' && !document.body.innerText.includes('Custom interface')`)
    assert.equal(await evaluate(`document.querySelector('option[value="custom:custom-test"]')`), null)
    assert.deepEqual(errors, [], 'renderer errors')
    console.log('PASS: RU/EN pages and dialogs; collapsed theme/localization sections, theme row layout, complete generated template, custom language upload/selection/persistence/deletion and invalid-file handling; no renderer errors')
    win.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG())
    win.destroy()
    app.exit(1)
  }
}).catch(error => { console.error(error); app.exit(1) })
