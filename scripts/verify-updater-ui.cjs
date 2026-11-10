const { app, BrowserWindow, contextBridge } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

if (process.type === 'renderer') {
  localStorage.setItem('sidebar_state', 'expanded')
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    let callback
    let status = { state: 'available', version: '0.2.0' }
    api.app = {
      getVersion: async () => '0.2.0', isElevated: async () => false,
      getUpdaterStatus: async () => status, checkUpdates: async () => status,
      getWhatsNew: async () => ({ fromVersion: '0.1.0', toVersion: '0.2.0', entries: [{ version: '0.2.0', notes: ['Fix VPN connection', '<script>unsafe</script>'] }] }),
      downloadUpdate: async () => { status = { state: 'downloading', percent: 42 }; callback?.(status) }
    }
    api.events.onUpdaterStatus = (cb) => { callback = cb; return () => { callback = null } }
    expose(name, api)
    expose('updaterTest', { setStatus: next => { status = next; callback?.(status) } })
  }
  require('./verify-ui.cjs')
} else {
  const assert = require('node:assert/strict')
  const output = path.resolve(__dirname, '../artifacts/updater-ui-check')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, 'user-data'))
  app.commandLine.appendSwitch('disable-features', 'WinUseBrowserSpellChecker')
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true, backgroundThrottling: false } })
    const errors = []
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message) })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const waitFor = async code => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(code)) return
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Timed out: ${code}`)
    }
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      win.showInactive()
      await waitFor(`document.querySelector('[role="dialog"]')?.textContent.includes("What's new")`)
      assert.ok(await evaluate(`document.querySelector('[role="dialog"]').textContent.includes('<script>unsafe</script>')`), 'remote notes render as text')
      await new Promise(resolve => setTimeout(resolve, 150))
      await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, 'whats-new.png'), image.toPNG()))
      await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent === 'Close').click()`)
      await waitFor(`!document.querySelector('[role="dialog"]')`)
      await new Promise(resolve => setTimeout(resolve, 150))
      assert.deepEqual(await evaluate(`Array.from(document.querySelector('.sidebar-footer').children).map(element => element.className)`), ['sidebar-vpn-badge', 'sidebar-routing'])
      assert.ok(await evaluate(`(() => { const button = document.querySelector('.sidebar-update'), settings = document.querySelector('nav [aria-label="Settings"]'); return button.parentElement === settings.closest('.sidebar-group') && button.getBoundingClientRect().bottom <= settings.getBoundingClientRect().top })()`), 'update button appears above settings')
      assert.ok(await evaluate(`(() => { const footer = document.querySelector('.sidebar-footer'); return footer.scrollWidth <= footer.clientWidth })()`), 'expanded footer fits')
      await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, 'expanded.png'), image.toPNG()))
      await evaluate(`document.querySelector('[aria-label="Settings"]').click()`)
      await waitFor(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Check for updates'))`)
      await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Check for updates')).click()`)
      await waitFor(`document.body.textContent.includes('0.2.0') && document.body.textContent.includes('available')`)
      await evaluate(`document.querySelector('.sidebar-trigger').click()`)
      await waitFor(`document.querySelector('#app-sidebar').dataset.state === 'collapsed'`)
      await new Promise(resolve => setTimeout(resolve, 250))
      assert.ok(await evaluate(`document.querySelector('.sidebar-update').getBoundingClientRect().width > 0`))
      await evaluate(`document.querySelector('.sidebar-update').click()`)
      await waitFor(`document.querySelector('.sidebar-update-percent')?.textContent === '42%'`)
      assert.ok(await evaluate(`document.querySelector('.sidebar-update').disabled`))
      await new Promise(resolve => setTimeout(resolve, 150))
      await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, 'collapsed.png'), image.toPNG()))
      for (const width of [840, 900, 1040]) {
        win.setContentSize(width, 720)
        await waitFor(`Math.abs(innerWidth - ${width}) <= 2`)
        for (const expanded of [false, true]) {
          if (await evaluate(`document.querySelector('#app-sidebar').dataset.state === 'expanded'`) !== expanded) await evaluate(`document.querySelector('.sidebar-trigger').click()`)
          await waitFor(`Math.round(document.querySelector('#app-sidebar').getBoundingClientRect().width) === ${expanded ? 256 : 64}`)
          for (const status of [{ state: 'available', version: '123.456.789-beta.123456789' }, { state: 'downloading', percent: 100 }, { state: 'downloaded' }, { state: 'error', message: 'test' }]) {
            await evaluate(`window.updaterTest.setStatus(${JSON.stringify(status)})`)
            await waitFor(`document.querySelector('.sidebar-update')?.dataset.state === '${status.state}'`)
            const layout = await evaluate(`(() => {
              const button = document.querySelector('.sidebar-update'), bounds = button.getBoundingClientRect(), badge = document.querySelector('.sidebar-vpn-badge .sidebar-label');
              return { fits: button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight,
                childrenFit: [...button.children].filter(el => getComputedStyle(el).display !== 'none').every(el => { const r = el.getBoundingClientRect(); return r.left >= bounds.left && r.right <= bounds.right && r.top >= bounds.top && r.bottom <= bounds.bottom }),
                statusFits: getComputedStyle(badge).display === 'none' || badge.scrollWidth <= badge.clientWidth };
            })()`)
            assert.deepEqual(layout, { fits: true, childrenFit: true, statusFits: true }, `${width}px / ${expanded ? 'expanded' : 'collapsed'} / ${status.state}`)
            if (width === 840 && status.state === 'downloading') {
              await new Promise(resolve => setTimeout(resolve, 150))
              fs.writeFileSync(path.join(output, `progress-100-${expanded ? 'expanded' : 'collapsed'}.png`), (await win.webContents.capturePage()).toPNG())
            }
          }
        }
      }
      await evaluate(`window.updaterTest.setStatus({ state: 'not-available' })`)
      await waitFor(`!document.querySelector('.sidebar-update')`)
      assert.deepEqual(errors, [])
      console.log('PASS: release notes, update above settings, fixed 256/64px sidebar at 840/900/1040px, all update states fit, 100% progress and unobstructed VPN status')
    } finally { win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
