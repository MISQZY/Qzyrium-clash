// Isolated rules/navigation regression check. No real VPN or user settings.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const scopes = []
    const getRules = api.mihomo.getRules
    api.mihomo.getRules = async scope => {
      scopes.push(scope ?? 'full')
      return getRules(scope)
    }
    api.uiTest.getRuleScopes = async () => scopes.slice()
    const iconPaths = []
    const icon = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, '../resources/icon.png')).toString('base64')}`
    api.app.getProcessIcon = async processPath => { iconPaths.push(processPath); return icon }
    api.uiTest.getIconPaths = async () => iconPaths.slice()
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const output = path.resolve(__dirname, '../artifacts/rules-ui')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true } })
    const evaluate = code => win.webContents.executeJavaScript(code).catch(error => { throw new Error(`${error.message}\n${code}`) })
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const waitFor = async code => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(code)) return
        await delay(50)
      }
      throw Error(`Timed out: ${code}`)
    }
    const navigate = async name => {
      await evaluate(`Array.from(document.querySelectorAll('nav button')).find(el => el.textContent.trim() === '${name}' || el.getAttribute('aria-label') === '${name}').click()`)
      await waitFor(`document.querySelector('h1')?.textContent === '${name}'`)
    }
    const rows = `document.querySelectorAll('.rules-table tbody tr')`
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      win.showInactive()
      await waitFor(`document.querySelector('h1')?.textContent === 'Home'`)
      await waitFor(`window.api.uiTest.getRuleScopes().then(scopes => scopes.includes('summary'))`)
      await navigate('Rules')
      await waitFor(`${rows}.length === 100`)
      assert.equal(await evaluate(`${rows}[0].cells[0].textContent`), '1')
      assert.equal((await evaluate('window.api.uiTest.getRuleScopes()')).at(-1), 'full')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Next').click()`)
      await waitFor(`${rows}[0]?.cells[0].textContent === '101'`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Next').click()`)
      await waitFor(`${rows}.length === 10 && ${rows}[0].cells[0].textContent === '201'`)
      await evaluate(`{ const input = document.querySelector('[aria-label="Search rules"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'service-209'); input.dispatchEvent(new Event('input', { bubbles: true })); }`)
      await waitFor(`${rows}.length === 1 && ${rows}[0].cells[0].textContent === '210'`)
      await evaluate(`{ const select = document.querySelector('[aria-label="Rule type"]'); select.value = 'IPCIDR'; select.dispatchEvent(new Event('change', { bubbles: true })); }`)
      await waitFor(`${rows}.length === 0`)
      await navigate('Settings')
      await navigate('Rules')
      await waitFor(`${rows}.length === 100 && ${rows}[0].cells[0].textContent === '1'`)
      // Per-application routing: mixed policies, path rules, cancellation and stale edits.
      const fixture = [
        { id: 'domain', type: 'DOMAIN', payload: 'example.com', proxy: 'DIRECT', position: 'top' },
        { id: 'app', type: 'PROCESS-NAME', payload: 'old.exe', proxy: 'PROXY', position: 'bottom', enabled: false },
        { id: 'override', type: 'PROCESS-NAME', payload: 'source.exe', proxy: 'DIRECT', sourceRule: 'PROCESS-NAME,source.exe,PROXY' }
      ]
      await evaluate(`window.api.profiles.saveCustomRules('remote', ${JSON.stringify(fixture)})`)
      const openSplit = async () => {
        await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Split Tunneling').click()`)
        await waitFor(`document.querySelector('[aria-label="Route: old.exe"]') && !document.querySelector('[aria-label="Route: old.exe"]').disabled`)
      }
      const setInput = async (label, value) => evaluate(`{
        const input = Array.from(document.querySelectorAll('input')).find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }`)
      const clickDialog = async text => evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === ${JSON.stringify(text)}).click()`)
      await openSplit()
      assert.equal(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('Popular presets')`), false)
      assert.equal(await evaluate(`document.querySelector('[aria-label="Route: old.exe"]').value`), 'PROXY')
      assert.equal(await evaluate(`document.querySelector('[aria-label="Route: source.exe"]')`), null)
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === 'Save').disabled`), true)
      // Rules has no shared connections dataset: opening the dialog must fetch its own.
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(el => el.textContent.trim() === 'browser.exe')`)
      await clickDialog('browser.exe')
      await waitFor(`document.querySelector('[aria-label="Route: browser.exe"]')?.closest('div')?.querySelector('img')?.naturalWidth > 0`)
      assert.ok((await evaluate('window.api.uiTest.getIconPaths()')).includes('C:\\Program Files\\Example\\browser.exe'))
      await evaluate(`document.querySelector('[aria-label="Remove: browser.exe"]').click()`)
      const longPath = 'C:\\Apps\\' + 'long-application-'.repeat(15) + '.exe'
      await setInput('Add application', longPath)
      await clickDialog('Add')
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] p')).some(el => el.textContent === ${JSON.stringify(longPath)})`)
      win.setContentSize(560, 700)
      await delay(200)
      assert.ok(await evaluate(`{ const el = Array.from(document.querySelectorAll('[role="dialog"] p')).find(el => el.textContent === ${JSON.stringify(longPath)}); el.scrollWidth <= el.clientWidth + 1 }`), 'long process paths wrap')
      assert.ok(await evaluate(`{ const el = document.querySelector('[role="dialog"]'); el.scrollWidth <= el.clientWidth + 1 }`), 'split dialog has no horizontal overflow')
      fs.writeFileSync(path.join(output, 'split-tunneling-narrow.png'), (await win.webContents.capturePage()).toPNG())
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.getAttribute('aria-label') === ${JSON.stringify('Remove: ' + longPath)}).click()`)
      win.setContentSize(1040, 720)
      await setInput('Add application', '"C:\\Apps\\Example.EXE"')
      await clickDialog('Add')
      await waitFor(`Array.from(document.querySelectorAll('select')).some(el => el.getAttribute('aria-label') === ${JSON.stringify('Route: C:\\Apps\\Example.EXE')})`)
      await evaluate(`{ const select = document.querySelector('[aria-label="New application route"]'); select.value = 'PROXY'; select.dispatchEvent(new Event('change', { bubbles: true })); }`)
      await setInput('Add application', 'curl')
      await clickDialog('Add')
      await waitFor(`document.querySelector('[aria-label="Route: curl"]')?.value === 'PROXY'`)
      await setInput('Add application', 'CURL')
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(el => el.textContent.trim() === 'Add').disabled`), true)
      await setInput('Search applications', 'curl')
      await waitFor(`!document.querySelector('[aria-label="Route: old.exe"]')`)
      await setInput('Search applications', '')
      await waitFor(`!!document.querySelector('[aria-label="Route: old.exe"]')`)
      fs.writeFileSync(path.join(output, 'split-tunneling.png'), (await win.webContents.capturePage()).toPNG())
      await clickDialog('Save')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const saved = await evaluate(`window.api.profiles.getCustomRules('remote')`)
      assert.equal(saved[0].type, 'PROCESS-PATH')
      assert.equal(saved[0].payload, 'C:\\Apps\\Example.EXE')
      assert.equal(saved[1].payload, 'curl')
      assert.equal(saved[1].proxy, 'PROXY')
      assert.deepEqual(saved.slice(2), fixture)
      await openSplit()
      await evaluate(`document.querySelector('[aria-label="Remove: old.exe"]').click()`)
      await clickDialog('Cancel')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      assert.deepEqual(await evaluate(`window.api.profiles.getCustomRules('remote')`), saved)
      await openSplit()
      await evaluate(`document.querySelector('[aria-label="Remove: old.exe"]').click()`)
      await evaluate(`window.api.profiles.saveCustomRules('remote', ${JSON.stringify([...saved, { id: 'external', type: 'PROCESS-NAME', payload: 'external.exe', proxy: 'DIRECT' }])})`)
      await clickDialog('Save')
      await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('another editor')`)
      assert.equal((await evaluate(`window.api.profiles.getCustomRules('remote')`)).length, saved.length + 1)
      await clickDialog('Cancel')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      await navigate('Connections')
      await waitFor(`!!document.querySelector('[aria-label="Create rule"]')`)
      await evaluate(`document.querySelector('[aria-label="Create rule"]').click()`)
      await waitFor(`document.querySelector('[role="dialog"] [aria-label="Rule type"]')?.value === 'PROCESS-NAME'`)
      assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'Connections', 'group action does not open drilldown')
      assert.deepEqual(await evaluate(`Array.from(document.querySelector('[role="dialog"] [aria-label="Rule type"]').options).map(el => el.value)`), ['PROCESS-NAME', 'PROCESS-PATH'])
      assert.equal(await evaluate(`document.querySelector('[role="dialog"] textarea').value`), 'browser.exe')
      win.setContentSize(560, 700)
      await delay(200)
      fs.writeFileSync(path.join(output, 'process-group-rule-narrow.png'), (await win.webContents.capturePage()).toPNG())
      await clickDialog('Create rule')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const groupRules = await evaluate(`window.api.profiles.getCustomRules('remote')`)
      assert.equal(groupRules[0].type, 'PROCESS-NAME')
      assert.equal(groupRules[0].payload, 'browser.exe')
      win.setContentSize(1040, 720)
      await evaluate(`document.querySelector('[aria-label="Create rule"]').closest('.group').click()`)
      await waitFor(`document.querySelector('h1')?.textContent === 'browser.exe'`)
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).filter(el => el.getAttribute('aria-label') === 'Create rule' || el.textContent.trim() === 'Create rule').length`), 1, 'only the group header offers quick rules in drilldown')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'Create rule').click()`)
      await waitFor(`document.querySelector('[role="dialog"] [aria-label="Rule type"]')?.value === 'PROCESS-NAME'`)
      await clickDialog('Close')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.trim() === 'All connections').click()`)
      await waitFor(`!!document.querySelector('[aria-label="Create rule"]')`)
      await evaluate(`document.querySelector('[aria-label="Create rule"]').click()`)
      await waitFor(`!!document.querySelector('[role="dialog"] textarea')`)
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] img')).some(el => el.naturalWidth > 0)`)
      win.setContentSize(560, 700)
      await delay(200)
      assert.ok(await evaluate(`{ const el = document.querySelector('[role="dialog"]'); el.scrollWidth <= el.clientWidth + 1 }`), 'quick rule has no horizontal overflow')
      assert.ok(await evaluate(`{ const el = document.querySelector('[role="dialog"] textarea'); el.scrollWidth <= el.clientWidth + 1 && getComputedStyle(el).whiteSpace === 'pre-wrap' }`), 'editable long destinations wrap')
      fs.writeFileSync(path.join(output, 'quick-rule-narrow.png'), (await win.webContents.capturePage()).toPNG())
      await evaluate(`{ const el = document.querySelector('[role="dialog"] [aria-label="Rule type"]'); el.value = 'PROCESS-PATH'; el.dispatchEvent(new Event('change', { bubbles: true })); }`)
      await waitFor(`document.querySelector('[role="dialog"] textarea')?.value === ${JSON.stringify('C:\\Program Files\\Example\\browser.exe')}`)
      await evaluate(`{ const el = document.querySelector('[aria-label="Action"]'); el.value = 'PROXY'; el.dispatchEvent(new Event('change', { bubbles: true })); }`)
      await evaluate(`{ const el = document.querySelector('[aria-label="Priority"]'); el.value = 'bottom'; el.dispatchEvent(new Event('change', { bubbles: true })); }`)
      await clickDialog('Create rule')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const quickRules = await evaluate(`window.api.profiles.getCustomRules('remote')`)
      assert.equal(quickRules.at(-1).type, 'PROCESS-PATH')
      assert.equal(quickRules.at(-1).payload, 'C:\\Program Files\\Example\\browser.exe')
      assert.equal(quickRules.at(-1).proxy, 'PROXY')
      assert.equal(quickRules.at(-1).position, 'bottom')
      win.setContentSize(1040, 720)
      await navigate('Home')
      await waitFor(`window.api.uiTest.getRuleScopes().then(scopes => scopes.at(-1) === 'summary')`)
      console.log('PASS: rules navigation, per-app routes/icons/wrapping, process group quick rules, group header actions, type dropdown, route/priority selection, cancellation and stale edit protection')
    } finally {
      win.destroy()
      app.quit()
    }
  }).catch(error => { console.error(error); app.exit(1) })
}
