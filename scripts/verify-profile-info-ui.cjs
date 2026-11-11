// Isolated subscription-card and settings regression; never touches real profiles or proxy.
const { app, BrowserWindow, contextBridge } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let saved, fail = false
    let info = { total: 100 * 1024 ** 3, upload: 5 * 1024 ** 3, download: 20 * 1024 ** 3, expire: Math.floor(Date.now() / 1000) + 10 * 86400 }
    const getList = api.profiles.getList
    api.profiles.getList = async () => {
      const profiles = await getList()
      profiles[0].userInfo = info
      return profiles
    }
    const updateInfo = api.profiles.updateInfo
    api.profiles.updateInfo = async (id, patch) => {
      if (fail) throw new Error('Provider unavailable')
      saved = patch
      return updateInfo(id, patch)
    }
    expose('profileTest', { setInfo: value => { info = value }, getSaved: () => saved, fail: value => { fail = value } })
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/profile-info-ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  if (process.env.PROFILE_UI_CAPTURE !== '1') app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: process.env.PROFILE_UI_CAPTURE === '1', width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const errors = []
    win.webContents.on('console-message', (event) => { const level = event.level; const message = event.message; if (level === 'error' || level >= 3) errors.push(message) })
    const evaluate = async code => { try { return await win.webContents.executeJavaScript(code) } catch (error) { throw new Error(`${error.message}: ${code}`, { cause: error }) } }
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const waitFor = async code => {
      for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${code})`)) return; await delay(50) }
      throw new Error(`Timed out: ${code}`)
    }
    const clickText = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)})?.click()`)
    const setValue = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`)
    const values = () => evaluate(`Array.from(document.querySelectorAll('[data-subscription-info] dd')).slice(0, 3).map(el => el.textContent)`)
    const refresh = async info => {
      await evaluate(`window.profileTest.setInfo(${JSON.stringify(info)})`)
      await evaluate(`document.querySelector('[data-subscription-info]').parentElement.querySelector('button[aria-label="Update Subscription"]').click()`)
      await delay(150)
    }
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`document.querySelector('[aria-label="Profiles"]')`)
      await evaluate(`document.querySelector('[aria-label="Profiles"]').click()`)
      await waitFor(`document.querySelector('[data-subscription-info]')`)
      assert.deepEqual((await values()).slice(0, 2), ['75.0 GB', '10 d'])
      assert.equal((await values())[2], new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(Date.now() + 10 * 86400000))
      assert.equal(await evaluate(`document.querySelector('[data-subscription-info]').parentElement.textContent.includes('long-path-')`), false, 'card shows hostname without access token')
      assert.equal(await evaluate(`(() => { const card = document.querySelector('[data-subscription-info]').parentElement; const refresh = card.querySelector('[aria-label="Update Subscription"]'); const more = card.querySelector('[aria-label="More actions"]'); return refresh.textContent.trim() === '' && refresh.parentElement === more.parentElement && refresh.getBoundingClientRect().top < card.querySelector('[data-subscription-info]').getBoundingClientRect().top })()`), true, 'refresh is an icon beside settings and the menu above statistics')
      if (process.env.PROFILE_UI_CAPTURE === '1') { win.show(); win.focus() }
      await delay(750)
      fs.writeFileSync(path.join(output, 'card.png'), (await win.webContents.capturePage()).toPNG())

      await evaluate(`document.querySelector('[data-subscription-info]').parentElement.querySelector('button[aria-label="Edit profile"]').click()`)
      await waitFor(`document.querySelector('[role="dialog"] select')`)
      assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] [data-subscription-info]').length`), 0, 'statistics stay on the card')
      assert.equal(await evaluate(`document.querySelector('[role="dialog"] details').open`), false)
      await setValue('[role="dialog"] select', 'custom')
      await waitFor(`document.querySelector('[role="dialog"] input[type="number"]')`)
      await setValue('[role="dialog"] input[type="number"]', '5')
      assert.equal(await evaluate(`document.querySelector('[role="dialog"] form').checkValidity()`), false)
      await setValue('[role="dialog"] input[type="number"]', '90')
      await evaluate(`document.querySelector('[role="dialog"] summary').click()`)
      await setValue('[role="dialog"] input[id$="-ua"]', 'ClashMeta')
      await evaluate(`document.querySelector('[role="dialog"] .overflow-y-auto').scrollTop = 9999`)
      if (process.env.PROFILE_UI_CAPTURE === '1') { win.show(); win.focus() }
      await delay(750)
      fs.writeFileSync(path.join(output, 'settings.png'), (await win.webContents.capturePage()).toPNG())
      win.setSize(840, 560)
      await delay(100)
      assert.equal(await evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); const button = dialog.querySelector('button[type="submit"]').getBoundingClientRect(); return button.top >= 0 && button.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth + 1 })()`), true, 'footer visible with advanced settings open in short window')
      await evaluate(`window.profileTest.fail(true)`)
      await clickText('Save changes')
      await waitFor(`document.querySelector('[role="dialog"] [role="alert"]')`)
      await evaluate(`window.profileTest.fail(false)`)
      await clickText('Save changes')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const saved = await evaluate(`window.profileTest.getSaved()`)
      assert.equal(saved.interval, 90)
      assert.equal(saved.customUA, 'ClashMeta')
      assert.equal(saved.autoUpdate, true)

      await refresh({ total: 1024, upload: 2048, download: 1, expire: 1 })
      assert.deepEqual((await values()).slice(0, 2), ['0 B', 'Expired'])
      await refresh({ total: 0, expire: 0 })
      assert.deepEqual(await values(), ['Unlimited', 'No expiration', 'No expiration'])
      await refresh({})
      assert.deepEqual(await values(), ['Not provided', 'Not provided', 'Not provided'])
      await refresh({ total: 1024 })
      assert.equal((await values())[0], 'Not provided', 'missing usage is not presented as a full allowance')
      assert.deepEqual(errors, [])
      console.log('PASS: subscription allowance, expiry, missing/unlimited data, custom schedule, validation, advanced settings, save recovery and short-window layout')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
