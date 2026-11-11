// Isolated editor check; no real VPN, profiles or user settings.
const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const assert = require('node:assert/strict')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let rules = [
      { id: 'invalid', type: 'DOMAIN', payload: 'broken.example', proxy: 'Missing', position: 'bottom', enabled: true, validationError: 'rules[1] proxy [Missing] not found' },
      { id: 'disabled', type: 'DOMAIN', payload: 'disabled.example', proxy: 'DIRECT', enabled: false },
      { id: 'long', type: 'DOMAIN-SUFFIX', payload: `${'long-hostname.'.repeat(30)}example`, proxy: 'DIRECT' }
    ]
    let failRead = false
    api.uiTest.failRuleRead = async value => { failRead = value }
    api.profiles.getCustomRules = async () => { if (failRead) throw new Error('fixture rule read failed'); return rules }
    let warningListener
    api.events.onWarning = callback => { warningListener = callback; return () => { warningListener = undefined } }
    api.kernel.getRuleWarning = async () => null
    api.uiTest.emitWarning = async () => warningListener?.('Some user rules could not be processed.')
    let validationCount = 0
    api.uiTest.getRuleValidationCount = async () => validationCount
    api.profiles.validateCustomRules = async (_id, value) => {
      validationCount++
      await new Promise(resolve => setTimeout(resolve, 150))
      return value.map(rule => ({ ...rule, validationError: rule.proxy === 'Missing' ? 'rules[1] proxy [Missing] not found' : undefined }))
    }
    api.profiles.saveCustomRules = async (_id, value) => {
      rules = value.map(rule => rule.proxy === 'DIRECT' ? { ...rule, validationError: undefined } : rule)
    }
    let rawConfig = 'proxies: []\nrules:\n  - DOMAIN,base.example,DIRECT\n  - MATCH,DIRECT\n'
    api.profiles.getRawConfig = async () => rawConfig
    api.uiTest.resetOrderFixture = async () => {
      rules = []
      rawConfig = 'proxies: []\nrules:\n  - DOMAIN,duplicate.example,DIRECT\n  - DOMAIN,between.example,DIRECT\n  - DOMAIN,duplicate.example,DIRECT\n  - MATCH,DIRECT\n'
    }
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const output = path.resolve(__dirname, '../artifacts/rule-recovery-ui')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.disableHardwareAcceleration()
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1100, height: 760, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const evaluate = code => win.webContents.executeJavaScript(code).catch(error => {
      throw new Error(`Failed to evaluate: ${code}`, { cause: error })
    })
    const waitFor = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    const click = text => evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`)
    const invalidRow = `Array.from(document.querySelectorAll('[role="dialog"] div.group')).find(el => el.textContent.includes('broken.example'))`
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      await waitFor(`document.querySelector('[aria-label="Profiles"]')`)
      await evaluate(`document.querySelector('[aria-label="Profiles"]').click()`)
      await waitFor(`document.querySelector('[aria-label="Edit rules"]')`)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`!!(${invalidRow})`)
      assert.ok(await evaluate(`${invalidRow}.classList.contains('grayscale')`), 'invalid rule is gray')
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] div.group')).every(row => row.getBoundingClientRect().height === 48)`), 'short, invalid, disabled and long rules have the same height')
      await evaluate(`${invalidRow}.querySelector('button[aria-label]').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))`)
      await waitFor(`document.querySelector('[role="tooltip"]')?.textContent.includes('rules[1] proxy [Missing] not found')`)
      await evaluate(`${invalidRow}.querySelector('button[aria-label]').click()`)
      assert.ok(await evaluate(`!Array.from(document.querySelectorAll('[role="dialog"] input')).some(input => input.value === 'broken.example')`), 'help icon does not start editing')
      await evaluate(`${invalidRow}.querySelector('button[aria-label]').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`)
      assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('disabled.example')`), 'manually disabled rules remain visible')
      await click('YAML Mode')
      await waitFor(`document.querySelector('.cm-content')?.textContent.includes('disabled:')`)
      await click('Visual Mode')
      await waitFor(`!!(${invalidRow})`)
      assert.ok(await evaluate(`${invalidRow}.classList.contains('grayscale')`), 'invalid state survives YAML round trip')
      await evaluate(`${invalidRow}.click()`)
      await click('Save')
      await waitFor(`!!(${invalidRow})`)
      assert.ok(await evaluate(`${invalidRow}.classList.contains('grayscale')`), 'saving an unchanged invalid rule does not mark it valid')
      assert.equal(await evaluate(`window.api.uiTest.getRuleValidationCount()`), 1, 'inline Save checks the rule immediately')
      await evaluate(`${invalidRow}.click()`)
      await waitFor(`document.querySelector('[role="dialog"] input[autofocus]') || Array.from(document.querySelectorAll('[role="dialog"] input')).some(el => el.value === 'broken.example')`)
      await evaluate(`document.querySelector('fieldset [role="combobox"][aria-label="Proxy / Target"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }))`)
      await waitFor(`document.querySelector('[role="listbox"]')`)
      await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(option => option.textContent.trim() === 'DIRECT').click()`)
      await click('Save')
      await waitFor(`!!(${invalidRow})`)
      assert.equal(await evaluate(`${invalidRow}.classList.contains('grayscale')`), false, 'successful inline validation immediately clears the error')
      assert.equal(await evaluate(`window.api.uiTest.getRuleValidationCount()`), 2)
      await click('Save & Apply')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const saved = await evaluate(`window.api.profiles.getCustomRules('remote')`)
      assert.equal(saved.find(rule => rule.payload === 'broken.example').proxy, 'DIRECT')
      assert.equal(saved.find(rule => rule.payload === 'broken.example').validationError, undefined)
      assert.equal(saved.find(rule => rule.payload === 'disabled.example').enabled, false)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`!!(${invalidRow})`)
      assert.equal(await evaluate(`${invalidRow}.classList.contains('grayscale')`), false, 'only backend validation clears the invalid state')
      const row = payload => `Array.from(document.querySelectorAll('[role="dialog"] div.group')).find(el => el.querySelector('p')?.textContent === ${JSON.stringify(payload)})`
      const moveUp = payload => evaluate(`${row(payload)}.querySelector('.lucide-chevron-up').closest('button').click()`)
      const order = () => evaluate(`Array.from(document.querySelectorAll('[role="dialog"] div.group')).map(el => el.querySelector('p')?.textContent)`)
      await moveUp('broken.example')
      await moveUp('broken.example')
      await moveUp('base.example')
      const expectedOrder = await order()
      assert.ok(expectedOrder.indexOf('broken.example') < expectedOrder.indexOf('base.example'), 'user rule crosses a source rule')
      await click('YAML Mode')
      await waitFor(`document.querySelector('.cm-content')?.textContent.includes('sourceOccurrence:')`)
      assert.equal(await evaluate(`document.querySelector('.cm-content').textContent.includes('sourceRule:')`), false, 'subscription rule text is not duplicated in YAML')
      assert.equal(await evaluate(`document.querySelector('.cm-content').textContent.includes('order:')`), false, 'positions use prepend/append without a separate order snapshot')
      await click('Visual Mode')
      await waitFor(`!!(${invalidRow})`)
      assert.deepEqual(await order(), expectedOrder, 'YAML round trip preserves user and source positions')
      await click('Save & Apply')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`!!(${invalidRow})`)
      assert.deepEqual(await order(), expectedOrder, 'saving and reopening preserves both kinds of rules')
      await click('Cancel')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      await evaluate(`window.api.uiTest.resetOrderFixture()`)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] div.group')).length === 4`)
      for (const index of [2, 1]) await evaluate(`document.querySelectorAll('[role="dialog"] div.group')[${index}].querySelector('.lucide-chevron-up').closest('button').click()`)
      await evaluate(`document.querySelectorAll('[role="dialog"] div.group')[0].querySelector('button[title="Delete"]').click()`)
      await click('YAML Mode')
      await waitFor(`document.querySelector('.cm-content')?.textContent.includes('sourceOccurrence: 1')`)
      assert.equal(await evaluate(`document.querySelector('.cm-content').textContent.includes('sourceRule:')`), false, 'deleted duplicate uses only its occurrence to identify the source')
      await click('Visual Mode')
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] div.group')).length === 4`)
      assert.ok(await evaluate(`document.querySelectorAll('[role="dialog"] div.group')[0].classList.contains('opacity-60')`), 'YAML preserves the moved, deleted duplicate at its position')
      assert.equal(await evaluate(`document.querySelectorAll('[role="dialog"] div.group')[1].classList.contains('opacity-60')`), false, 'the other duplicate stays active')
      await click('Save & Apply')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const duplicateRules = await evaluate(`window.api.profiles.getCustomRules('remote')`)
      assert.equal(duplicateRules.length, 1, 'untouched subscription rows are not copied into overrides')
      assert.equal(duplicateRules[0].sourceOccurrence, 1)
      assert.equal(duplicateRules[0].offset, 0)
      assert.equal(duplicateRules[0].isDeleted, true)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] div.group')).length === 4`)
      assert.ok(await evaluate(`document.querySelectorAll('[role="dialog"] div.group')[0].classList.contains('opacity-60')`), 'reopening preserves the deleted duplicate position')
      await evaluate(`document.querySelectorAll('[role="dialog"] div.group')[0].querySelector('button[title="Restore"]').click()`)
      await click('Save & Apply')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      await evaluate(`window.api.uiTest.emitWarning()`)
      await waitFor(`Array.from(document.querySelectorAll('[role="alert"]')).some(el => el.textContent.includes('Some user rules'))`)
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role="alert"]')).find(el => el.textContent.includes('Some user rules')).className.includes('border-warning')`), 'warning uses the app notification with warning styling')
      await evaluate(`Array.from(document.querySelectorAll('[role="alert"]')).find(el => el.textContent.includes('Some user rules')).querySelector('button').click()`)
      await waitFor(`!Array.from(document.querySelectorAll('[role="alert"]')).some(el => el.textContent.includes('Some user rules'))`)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`document.querySelector('[role="dialog"] [role="combobox"][aria-label="Rule Type"]')`)
      const syntaxCases = [
        ['DOMAIN', 'пример123.рф'], ['DOMAIN', 'example.123'], ['DOMAIN-SUFFIX', 'рф'],
        ['DOMAIN-REGEX', '(?i)^пример[0-9]+\\.рф$'], ['DST-PORT', '80/443/8000-9000'],
        ['IP-CIDR6', '::ffff:192.0.2.1/128']
      ]
      for (const [type, payload] of syntaxCases) {
        await evaluate(`document.querySelector('[role="dialog"] [role="combobox"][aria-label="Rule Type"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false, pointerType: 'mouse' }))`)
        await waitFor(`document.querySelector('[role="listbox"]')`)
        await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(option => option.textContent.trim() === ${JSON.stringify(type)}).click()`)
        await evaluate(`{ const input = document.querySelector('[role="dialog"] input[placeholder]:not([aria-label])'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(payload)}); input.dispatchEvent(new Event('input', { bubbles: true })); }`)
        await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(button => button.textContent.trim() === 'Prepend' && !button.disabled)`)
        await click('Prepend')
        await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] div.group')).some(row => row.querySelector('p')?.textContent === ${JSON.stringify(payload)})`)
      }
      const editRow = row('пример123.рф')
      await evaluate(`${editRow}.click()`)
      await evaluate(`{ const input = document.querySelector('fieldset input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'пример456.рф'); input.dispatchEvent(new Event('input', { bubbles: true })); }`)
      await click('Save')
      await waitFor(`!!(${row('пример456.рф')})`)
      await click('Save & Apply')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      const syntaxSaved = await evaluate(`window.api.profiles.getCustomRules('remote')`)
      assert.ok(syntaxSaved.some(rule => rule.payload === 'пример456.рф'), 'Unicode domain edits are saved')
      assert.ok(syntaxSaved.some(rule => rule.payload === '(?i)^пример[0-9]+\\.рф$'), 'core regex syntax can be added and saved')
      await evaluate(`window.api.uiTest.failRuleRead(true)`)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`document.querySelector('[role="dialog"]').textContent.includes('fixture rule read failed')`)
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === 'Save & Apply').disabled`), 'failed read blocks destructive save')
      await click('Cancel')
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      await evaluate(`window.api.uiTest.failRuleRead(false)`)
      await evaluate(`document.querySelector('[aria-label="Edit rules"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(button => button.textContent.trim() === 'Save & Apply' && !button.disabled)`)
      console.log('PASS: rule edits, YAML order, warnings and safe recovery from failed reads')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
