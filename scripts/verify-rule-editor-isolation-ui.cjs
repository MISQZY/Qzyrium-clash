// Isolated fixtures exercise draft ownership and saving without a VPN or real profiles.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    api.profiles.getRawConfig = async () => 'rules:\n  - DOMAIN,base.example,DIRECT\n  - MATCH,DIRECT\n'
    api.profiles.validateCustomRules = async (_, rules) => rules
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  app.setPath('userData', path.resolve(__dirname, '../artifacts/rule-editor-isolation-ui/user-data'))
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1100, height: 760,
      webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const errors = []
    win.webContents.on('console-message', event => {
      if (event.level === 'error') errors.push(event.message)
    })
    const evaluate = code => win.webContents.executeJavaScript(code).catch(error => { throw new Error(`${error.message}\n${code}`) })
    const waitFor = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    const click = text => evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === ${JSON.stringify(text)}).click()`)
    const setInput = (selector, value) => evaluate(`{
      const input = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }`)
    // React updates this DOM props object on a parent render even if the DOM looks identical.
    const rememberHeader = () => evaluate(`{
      const button = Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === 'Visual Mode');
      window.headerButton = button;
      window.headerPropsKey = Object.keys(button).find(key => key.startsWith('__reactProps$'));
      window.headerProps = button[window.headerPropsKey];
      true;
    }`)
    const headerUnchanged = () => evaluate('window.headerButton[window.headerPropsKey] === window.headerProps')
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`document.querySelector('[aria-label="Profiles"]')`)
      await evaluate(`document.querySelector('[aria-label="Profiles"]').click()`)
      await waitFor(`document.querySelector('[aria-label="Edit rules"]')`)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`document.querySelector('[role="dialog"] [title="base.example"]')`)
      const createInput = '[role="dialog"] input:not([type])'
      await rememberHeader()
      await setInput(createInput, 'new.example')
      await waitFor(`document.querySelector(${JSON.stringify(createInput)})?.value === 'new.example'`)
      assert.equal(await headerUnchanged(), true, 'typing a new rule does not render the dialog header')
      await click('Prepend')
      await waitFor(`document.querySelector('[role="dialog"] p[title="new.example"]')`)
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(createInput)}).value`), '')

      await evaluate(`document.querySelector('[role="dialog"] p[title="new.example"]').closest('[draggable]').click()`)
      await waitFor(`document.querySelector('[role="dialog"] fieldset input')`)
      await rememberHeader()
      await setInput('[role="dialog"] fieldset input', 'edited.example')
      assert.equal(await headerUnchanged(), true, 'typing an inline draft does not render the dialog header')
      // Filtering unmounts the edited row; returning must restore its local draft.
      await setInput('[role="dialog"] input[type="text"][placeholder*="Search"]', 'base.example')
      await waitFor(`!document.querySelector('[role="dialog"] fieldset')`)
      await setInput('[role="dialog"] input[type="text"][placeholder*="Search"]', '')
      await waitFor(`document.querySelector('[role="dialog"] fieldset input')?.value === 'edited.example'`)
      await click('Save')
      await waitFor(`document.querySelector('[role="dialog"] p[title="edited.example"]')`)

      await click('YAML Mode')
      await waitFor(`!!document.querySelector('[role="dialog"] .cm-content')`)
      await rememberHeader()
      await evaluate(`{
        const view = document.querySelector('[role="dialog"] .cm-content').cmTile.root.view;
        const text = view.state.doc.toString().replace('edited.example', 'yaml.example');
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      }`)
      assert.equal(await headerUnchanged(), true, 'typing YAML does not render the dialog header')
      await click('Visual Mode')
      await waitFor(`document.querySelector('[role="dialog"] p[title="yaml.example"]')`)
      await click('YAML Mode')
      await waitFor(`document.querySelector('[role="dialog"] .cm-content')?.textContent.includes('yaml.example')`)
      await click('Save & Apply')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const saved = await evaluate(`window.api.profiles.getCustomRules('remote')`)
      assert.equal(saved.some(rule => rule.payload === 'yaml.example'), true, 'saving reads the latest YAML draft')
      assert.deepEqual(errors, [])
      console.log('PASS: isolated create/inline/YAML typing, draft restoration after filtering, mode switching and saving')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
