// Isolated production-renderer benchmark. Does not touch VPN or user settings.
const { app, BrowserWindow, contextBridge } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

if (process.type === 'renderer') {
  const expose = contextBridge.exposeInMainWorld.bind(contextBridge)
  contextBridge.exposeInMainWorld = (name, api) => {
    const get = api.settings.get
    api.settings.get = async () => {
      const settings = await get()
      settings.general.liteDashboard = process.env.MEMORY_LITE === '1'
      return settings
    }
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  const label = process.argv[2] || 'sample'
  const output = path.resolve(__dirname, '../artifacts/memory')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, `user-data-${label}`))
  if (process.env.MEMORY_SOFTWARE !== '0') app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('enable-precise-memory-info')
  app.whenReady().then(async () => {
    let core
    if (process.env.MEMORY_CORE === '1') {
      const { spawn } = require('node:child_process')
      const directory = path.join(output, `core-${label}`)
      fs.mkdirSync(directory, { recursive: true })
      const filename = path.join(directory, 'config.yaml')
      // No listeners, TUN, system proxy or network requests. Exercise real core
      // parsing and routing storage with a representative 20,000-rule profile.
      fs.writeFileSync(filename, 'mixed-port: 0\nlog-level: silent\nproxies: []\nrules:\n' + Array.from({ length: 20000 }, (_, i) => `  - DOMAIN,host${i}.example,DIRECT\n`).join('') + '  - MATCH,DIRECT\n')
      core = spawn(path.resolve('extra/sidecar/mihomo.exe'), ['-d', directory, '-f', filename], { windowsHide: true, stdio: 'ignore' })
      core.on('error', error => console.error(error))
    }
    const win = new BrowserWindow({ show: true, width: 1040, height: 720, webPreferences: { preload: __filename, sandbox: false, contextIsolation: true } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const samples = []
    const sample = async stage => {
      const processes = app.getAppMetrics().map(({ pid, type, memory }) => ({ pid, type, ...memory }))
      let privateWorkingSetMB
      if (process.platform === 'win32') {
        const { execFileSync } = require('node:child_process')
        const pids = [...processes.map(p => p.pid), ...(core?.pid ? [core.pid] : [])].join(',')
        const bytes = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.IDProcess -in @(${pids}) } | Measure-Object WorkingSetPrivate -Sum).Sum`], { windowsHide: true, encoding: 'utf8' })
        privateWorkingSetMB = Number(bytes.trim()) / 1024 / 1024
      }
      if (core && core.exitCode !== null) throw Error(`Benchmark core exited: ${core.exitCode}`)
      const heap = await evaluate('({ ...performance.memory && { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }, nodes: document.querySelectorAll("*").length, visibility: document.visibilityState, globe: !!document.querySelector(".globe-canvas") })')
      const row = { stage, privateWorkingSetMB, workingSetMB: processes.reduce((sum, p) => sum + p.workingSetSize, 0) / 1024, privateMB: processes.reduce((sum, p) => sum + (p.privateBytes || 0), 0) / 1024, processes, heap }
      samples.push(row)
      console.log(JSON.stringify(row))
    }
    const navigate = name => evaluate(`Array.from(document.querySelectorAll('nav button')).find(el => el.textContent.trim() === '${name}' || el.getAttribute('aria-label') === '${name}')?.click()`)
    try {
      await win.loadFile(path.resolve(__dirname, '../out/renderer/index.html'))
      win.show(); win.focus()
      await delay(5000)
      await sample('dashboard')
      await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, `${label}-dashboard.png`), image.toPNG())).catch(() => {})
      await navigate('Settings')
      await delay(2000)
      await sample('settings')
      for (let i = 0; i < 5; i++) {
        await navigate('Home'); await delay(350)
        await navigate('Settings'); await delay(350)
      }
      await sample('after-navigation')
      await navigate('Profiles'); await delay(500)
      await evaluate(`document.querySelector('button[aria-label="More actions"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false }))`)
      await delay(150)
      await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(el => el.textContent.includes('Edit file'))?.click()`)
      await delay(3000)
      if (!await evaluate(`!!document.querySelector('.monaco-editor')`)) throw Error('Editor did not open')
      await sample('editor')
      await evaluate(`document.querySelector('[role="dialog"] button:last-child')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await delay(200)
      await navigate('Home'); await delay(2000)
      await sample('after-editor')
      win.hide(); await delay(3000)
      await sample('hidden')
      fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify({ label, samples }, null, 2))
    } finally { core?.kill(); win.destroy(); app.quit() }
  }).catch(error => { console.error(error); app.exit(1) })
}
