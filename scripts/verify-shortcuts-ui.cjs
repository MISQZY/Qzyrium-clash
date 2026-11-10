// Controlled IPC fixture: records key combinations without registering real OS shortcuts.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const recording = []
    const getSettings = api.settings.get
    api.settings.get = async () => {
      const settings = await getSettings()
      settings.general.shortcuts ??= { showWindow: 'Control+Shift+Q' }
      return settings
    }
    api.settings.setShortcutRecording = async value => { recording.push(value) }
    expose('shortcutTest', { recording: () => recording })
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/shortcuts-ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: process.env.SHORTCUT_UI_CAPTURE === '1', width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const errors = []
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message) })
    const evaluate = async code => {
      try { return await win.webContents.executeJavaScript(code) }
      catch (error) { throw new Error(`${error.message}: ${code}`, { cause: error }) }
    }
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const waitFor = async code => {
      for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${code})`)) return; await delay(50) }
      throw new Error(`Timed out: ${code}`)
    }
    const row = action => `[data-shortcut-action="${action}"]`
    const start = async action => {
      await evaluate(`document.querySelector('${row(action)} button').click()`)
      await waitFor(`document.querySelector('${row(action)} button').getAttribute('aria-pressed') === 'true' && window.shortcutTest.recording().at(-1) === true`)
    }
    const key = (type, code, key, modifiers = {}) => evaluate(`window.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, code: ${JSON.stringify(code)}, key: ${JSON.stringify(key)}, ...${JSON.stringify(modifiers)} }))`)
    const finish = action => waitFor(`document.querySelector('${row(action)} button').getAttribute('aria-pressed') === 'false' && window.shortcutTest.recording().at(-1) === false`)
    const assign = async (action, code, text, modifiers) => {
      await start(action)
      await key('keydown', code, text, modifiers)
      await key('keyup', code, text, modifiers)
      await finish(action)
    }
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`document.querySelector('[aria-label="Settings"]')`)
      await evaluate(`document.querySelector('[aria-label="Settings"]').click()`)
      await waitFor(`document.querySelectorAll('[data-shortcut-action]').length === 6`)
      assert.equal(await evaluate(`document.querySelector('#general-shortcuts') !== null`), false, 'raw YAML editor has been replaced')
      assert.equal(await evaluate(`document.querySelector('${row('showWindow')} button').textContent`), 'Control+Shift+Q')

      await start('sysProxy')
      await key('keydown', 'KeyQ', '\u0439', { ctrlKey: true, shiftKey: true })
      await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('already assigned')`)
      await key('keyup', 'KeyQ', '\u0439', { ctrlKey: true, shiftKey: true })
      assert.equal(await evaluate(`document.querySelector('${row('sysProxy')} button').getAttribute('aria-pressed')`), 'true', 'duplicates keep the recorder open')
      await key('keydown', 'Escape', 'Escape')
      await finish('sysProxy')

      await assign('sysProxy', 'KeyP', '\u0437', { ctrlKey: true, altKey: true })
      assert.equal(await evaluate(`document.querySelector('${row('sysProxy')} button').textContent`), 'Ctrl+Alt+P', 'Russian layout maps to an Electron accelerator')
      await assign('tun', 'KeyT', 't', { ctrlKey: true, shiftKey: true })
      await assign('ruleMode', 'F6', 'F6', {})
      if (process.env.SHORTCUT_UI_CAPTURE === '1') {
        await evaluate(`document.querySelector('[data-shortcut-action]').closest('.rounded-xl').scrollIntoView({ block: 'center' })`)
        win.show(); win.focus()
        await delay(500)
        fs.writeFileSync(path.join(output, 'shortcuts.png'), (await win.webContents.capturePage()).toPNG())
      }
      await start('globalMode')
      await key('keydown', 'KeyB', 'b')
      await key('keyup', 'KeyB', 'b')
      assert.equal(await evaluate(`document.querySelector('${row('globalMode')} button').getAttribute('aria-pressed')`), 'true', 'bare typing keys are not accepted')
      await evaluate(`window.dispatchEvent(new Event('blur'))`)
      await finish('globalMode')
      await evaluate(`document.querySelector('${row('showWindow')} button:nth-child(2)').click()`)
      await waitFor(`document.querySelector('${row('showWindow')} button').textContent === 'Not assigned'`)
      await evaluate(`document.querySelector('button[type="submit"][form="settings-settings"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('[role="status"]')).some(el => el.textContent.includes('saved'))`)
      assert.deepEqual(await evaluate(`window.api.settings.get().then(settings => settings.general.shortcuts)`), { sysProxy: 'Ctrl+Alt+P', tun: 'Ctrl+Shift+T', ruleMode: 'F6' })

      win.setSize(840, 620)
      await delay(100)
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-shortcut-action] button')).every(button => button.getBoundingClientRect().right <= innerWidth)`), true, 'recorders fit the smallest supported window')
      await start('directMode')
      await evaluate(`document.querySelector('[aria-label="Profiles"]').click()`)
      await waitFor(`!document.querySelector('[data-shortcut-action]') && window.shortcutTest.recording().at(-1) === false`)
      assert.deepEqual(errors, [])
      console.log('PASS: six action recorders, Russian keys, aliases/conflicts, release-to-assign, clear/save, Escape/blur/navigation cleanup and responsive layout')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
