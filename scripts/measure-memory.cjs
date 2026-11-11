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
    const ruleCount = Number(process.env.MEMORY_RULE_COUNT || 0)
    if (Number.isSafeInteger(ruleCount) && ruleCount > 0 && ruleCount <= 500000) {
      const rule = index => ({ type: 'DomainSuffix', payload: `host-${index}.example.com`, proxy: index % 2 ? 'PROXY' : 'DIRECT' })
      // Emulate the IPC result, without retaining the full fixture in preload.
      api.mihomo.getRules = async scope => scope === 'summary'
        ? [rule(0), ...(ruleCount > 1 ? [rule(1)] : []), { type: 'MATCH', payload: '', proxy: 'DIRECT' }]
        : [...Array.from({ length: ruleCount }, (_, index) => rule(index)), { type: 'MATCH', payload: '', proxy: 'DIRECT' }]
    }
    expose(name, api)
  }
  require('./verify-ui.cjs')
} else {
  // Keep the benchmark alive long enough to measure renderer destruction.
  app.on('window-all-closed', () => {})
  const label = process.argv[2] || 'sample'
  const output = path.resolve(__dirname, '../artifacts/memory')
  fs.mkdirSync(output, { recursive: true })
  app.setPath('userData', path.join(output, `user-data-${label}`))
  // Match production: acceleration is enabled unless explicitly disabled.
  if (process.env.MEMORY_SOFTWARE === '1') app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('gpu-rasterization-msaa-sample-count', '0')
  app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,BackForwardCache,WinUseBrowserSpellChecker')
  app.commandLine.appendSwitch('disable-spellcheck')
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128 --optimize_for_size --expose-gc')
  app.commandLine.appendSwitch('renderer-process-limit', '1')
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
    const win = new BrowserWindow({ show: false, width: 1040, height: 720, titleBarStyle: 'hidden', titleBarOverlay: { height: 36, color: '#00000000', symbolColor: '#9ca3af' }, webPreferences: { spellcheck: false, preload: __filename, sandbox: false, contextIsolation: true } })
    const evaluate = code => win.webContents.executeJavaScript(code)
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    const samples = []
    const sample = async stage => {
      const processes = app.getAppMetrics().map(({ pid, type, memory }) => ({ pid, type, ...memory }))
      // Electron metrics below exclude the optional Mihomo process.
      if (core && core.exitCode !== null) throw Error(`Benchmark core exited: ${core.exitCode}`)
      const heap = win.isDestroyed() ? null : await evaluate('({ ...performance.memory && { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }, nodes: document.querySelectorAll("*").length, visibility: document.visibilityState, globe: !!document.querySelector(".globe-canvas"), dpr: devicePixelRatio, canvases: [...document.querySelectorAll("canvas")].map(c => ({ width: c.width, height: c.height })), scripts: performance.getEntriesByType("resource").filter(r => r.name.endsWith(".js")).map(r => r.name.split("/").pop()) })')
      let coreMemory = null
      let residentProcesses = null
      if (process.platform === 'win32') {
        const { execFileSync } = require('node:child_process')
        const ids = [...processes.map(p => p.pid), ...(core ? [core.pid] : [])]
        const command = `$ids = @(${ids.join(',')}); @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.IDProcess -in $ids } | ForEach-Object { @{ pid = [int]$_.IDProcess; workingSetMiB = $_.WorkingSet / 1MB; privateWorkingSetMiB = $_.WorkingSetPrivate / 1MB; privateMiB = $_.PrivateBytes / 1MB } }) | ConvertTo-Json -Compress`
        residentProcesses = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8', timeout: 15000 }))
        if (residentProcesses.length !== ids.length) throw Error('Incomplete Windows memory counters')
        coreMemory = residentProcesses.find(p => p.pid === core?.pid) ?? null
      }
      const workingSetMB = processes.reduce((sum, p) => sum + p.workingSetSize, 0) / 1024
      const privateMB = processes.reduce((sum, p) => sum + (p.privateBytes || 0), 0) / 1024
      const row = { stage, workingSetMB, privateMB, coreMemory, totalWorkingSetMiB: workingSetMB + (coreMemory?.workingSetMiB ?? 0), totalPrivateMiB: privateMB + (coreMemory?.privateMiB ?? 0), totalPrivateWorkingSetMiB: residentProcesses?.reduce((sum, p) => sum + p.privateWorkingSetMiB, 0) ?? null, residentProcesses, processes, heap, mainMemory: process.memoryUsage() }
      samples.push(row)
      console.log(JSON.stringify(row))
    }
    const waitFor = async code => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(code)) return
        await delay(100)
      }
      throw Error(`Timed out: ${code}`)
    }
    const navigate = async name => {
      await evaluate(`Array.from(document.querySelectorAll('nav button')).find(el => el.textContent.trim() === '${name}' || el.getAttribute('aria-label') === '${name}')?.click()`)
      await waitFor(`document.querySelector('h1')?.textContent === '${name}'`)
    }
    try {
      await win.loadFile(process.env.MEMORY_RENDERER_FILE || path.resolve(__dirname, '../out/renderer/index.html'))
      win.showInactive()
      await waitFor(`document.querySelector('h1')?.textContent === 'Home'`)
      await delay(5000)
      await sample('dashboard')
      if (process.env.MEMORY_SCREENSHOT === '1') await win.webContents.capturePage().then(image => fs.writeFileSync(path.join(output, `${label}-dashboard.png`), image.toPNG()))
      await navigate('Settings')
      await delay(2000)
      await sample('settings')
      for (let i = 0; i < 5; i++) {
        await navigate('Home'); await delay(350)
        await navigate('Settings'); await delay(350)
      }
      await sample('after-navigation')
      await navigate('Rules'); await delay(1500)
      await sample('rules')
      await navigate('Settings'); await delay(1000)
      await sample('after-rules')
      await navigate('Profiles'); await delay(500)
      await evaluate(`document.querySelector('button[aria-label="More actions"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false }))`)
      await delay(150)
      await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(el => el.textContent.includes('Edit file'))?.click()`)
      await delay(3000)
      await waitFor(`!!document.querySelector('[role="dialog"] .cm-editor')`)
      await sample('editor')
      await evaluate(`document.querySelector('[role="dialog"] button:last-child')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await waitFor(`!document.querySelector('[role="dialog"] .cm-editor')`)
      await navigate('Home'); await delay(2000)
      await sample('after-editor')
      win.hide(); await delay(3000)
      await sample('hidden')
      // Diagnostic only: distinguish live JS objects from collectable allocations.
      win.webContents.debugger.attach('1.3')
      try { await win.webContents.debugger.sendCommand('HeapProfiler.collectGarbage') }
      finally { win.webContents.debugger.detach() }
      await delay(1000)
      await sample('hidden-after-gc')
      win.destroy(); await delay(3000)
      await sample('renderer-destroyed')
    } finally {
      fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify({ label, electron: process.versions.electron, software: process.env.MEMORY_SOFTWARE === '1', lite: process.env.MEMORY_LITE === '1', fixture: true, ruleCount: Number(process.env.MEMORY_RULE_COUNT || 210), rendererFile: process.env.MEMORY_RENDERER_FILE || null, samples }, null, 2))
      core?.kill(); if (!win.isDestroyed()) win.destroy(); app.quit()
    }
  }).catch(error => { console.error(error); app.exit(1) })
}
