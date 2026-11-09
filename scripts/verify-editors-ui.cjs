// Isolated profile-editor regression. No real profiles, kernel, network or proxy changes.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let content = 'rules:\n  - MATCH,DIRECT\n'
    api.profiles.getRawConfig = async () => content
    api.profiles.saveRawConfig = async (_, value) => { content = value }
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/editor-ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const errors = []
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message) })
    const evaluate = code => win.webContents.executeJavaScript(code)
    // Use the mounted Monaco model in the hidden window; OS keyboard input is not delivered there.
    const findEditor = `(() => {
      const node = document.querySelector('[role="dialog"]');
      let fiber = node?.[Object.keys(node).find(key => key.startsWith('__reactFiber$'))];
      while (fiber) {
        let hook = fiber.memoizedState;
        while (hook && typeof hook === 'object') {
          const value = hook.memoizedState?.current;
          if (value && typeof value.getValue === 'function' && typeof value.setValue === 'function') return value;
          hook = hook.next;
        }
        fiber = fiber.return;
      }
      return null;
    })()`
    const waitFor = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    try {
      await win.webContents.session.clearStorageData()
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`document.querySelector('[aria-label="Profiles"]')`)
      await evaluate(`document.querySelector('[aria-label="Profiles"]').click()`)
      await waitFor(`document.querySelector('[aria-label="More actions"]')`)
      await evaluate(`document.querySelector('[aria-label="More actions"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false }))`)
      await waitFor(`Array.from(document.querySelectorAll('[role="menuitem"]')).some(item => item.textContent.trim() === 'Edit file')`)
      await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item => item.textContent.trim() === 'Edit file').click()`)
      await waitFor(`document.querySelector('[role="dialog"] .monaco-editor textarea')`)
      await waitFor(`${findEditor}?.getValue().includes('MATCH')`)
      const toggleDiff = () => evaluate(`Array.from(document.querySelectorAll('[role="dialog"] label')).find(label => label.textContent.includes('Show changes')).querySelector('[role="switch"]').click()`)
      await evaluate(`{ const editor = ${findEditor}; editor.setValue('# plain edit\\n' + editor.getValue()); }`)
      await toggleDiff()
      await waitFor(`document.querySelector('.monaco-diff-editor .modified textarea')`)
      await waitFor(`${findEditor}?.getDomNode()?.closest('.modified')`)
      await waitFor(`${findEditor}?.getValue().includes('plain')`)
      await evaluate(`{ const editor = ${findEditor}; editor.setValue('# diff edit\\n' + editor.getValue()); }`)
      await toggleDiff()
      await waitFor(`!document.querySelector('.monaco-diff-editor') && document.querySelector('[role="dialog"] .monaco-editor textarea')`)
      await waitFor(`${findEditor}?.getValue().includes('diff')`)
      await toggleDiff()
      await waitFor(`document.querySelector('.monaco-diff-editor .modified textarea')`)
      await waitFor(`${findEditor}?.getDomNode()?.closest('.modified')`)
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === 'Save & Apply').click()`)
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const saved = await evaluate(`window.api.profiles.getRawConfig('remote')`)
      assert.ok(saved.includes('# plain edit') && saved.includes('# diff edit'), `edits in both editor modes survive switching and saving: ${JSON.stringify(saved)}`)
      assert.deepEqual(errors, [])
      console.log('PASS: YAML edits survive plain/diff mode switching, modified editor saves and Monaco cleanup')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
