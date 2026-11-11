// Real IPC boundary fixture. No VPN, OS changes or application services.
const electron = require('electron')

if (process.type === 'renderer') {
  electron.contextBridge.exposeInMainWorld('ipcTest', {
    invoke: value => electron.ipcRenderer.invoke('app:copy-to-clipboard', value)
      .then(result => ({ result }), error => ({ error: error.message }))
  })
} else {
  const { app, BrowserWindow, ipcMain } = electron
  const assert = require('node:assert/strict')
  const fs = require('node:fs')
  const path = require('node:path')
  const { pathToFileURL } = require('node:url')
  const { loadTypeScript } = require('./fixtures/typescript.cjs')
  const directory = path.resolve(__dirname, '../artifacts/ipc-ui')
  fs.mkdirSync(directory, { recursive: true })
  app.setPath('userData', path.join(directory, 'user-data'))
  app.disableHardwareAcceleration()
  const document = path.join(directory, 'index.html')
  fs.writeFileSync(document, '<!doctype html><title>IPC fixture</title><body></body>')
  const expectedUrl = pathToFileURL(document).href
  app.whenReady().then(async () => {
    const windows = []
    const createWindow = () => {
      // Subframe preload is enabled only here to test a hostile frame invoking IPC.
      const win = new BrowserWindow({ show: false, webPreferences: {
        preload: __filename, contextIsolation: true, sandbox: false, nodeIntegrationInSubFrames: true
      } })
      windows.push(win)
      return win
    }
    const primary = createWindow(), foreign = createWindow()
    let current = primary, calls = 0
    const { createTrustedRegistrar } = loadTypeScript('src/main/ipc/trusted-handler.ts')
    createTrustedRegistrar(ipcMain, { getMainWindow: () => current, getRendererUrl: () => expectedUrl })(
      'app:copy-to-clipboard', (_event, text) => { calls++; return text })
    const invoke = (frame, value) => frame.executeJavaScript(`window.ipcTest.invoke(${JSON.stringify(value)})`)
    const reject = async (frame, value, message) => {
      const result = await invoke(frame, value)
      assert.match(result.error ?? '', message)
    }
    try {
      await primary.loadURL(expectedUrl)
      await foreign.loadURL(expectedUrl)
      assert.deepEqual(await invoke(primary.webContents, 'main'), { result: 'main' })
      await reject(foreign.webContents, 'foreign', /Untrusted IPC sender/)
      await reject(primary.webContents, false, /Invalid IPC arguments/)
      await primary.webContents.executeJavaScript(`new Promise(resolve => {
        const frame = document.createElement('iframe'); frame.onload = () => resolve(true);
        frame.src = ${JSON.stringify(expectedUrl)} + '?iframe'; document.body.append(frame);
      })`)
      const child = primary.webContents.mainFrame.frames[0]
      assert.ok(child, 'subframe exists and runs its own preload')
      await reject(child, 'iframe', /Untrusted IPC sender/)
      await primary.loadURL('data:text/html,<title>Untrusted document</title>')
      await reject(primary.webContents, 'changed-document', /Untrusted IPC sender/)
      primary.destroy()
      current = foreign
      assert.deepEqual(await invoke(foreign.webContents, 'replacement'), { result: 'replacement' })
      current = null
      await reject(foreign.webContents, 'no-current-window', /Untrusted IPC sender/)
      assert.equal(calls, 2, 'only current trusted main documents execute the command')
      console.log('PASS: real Electron IPC rejects a foreign window, iframe, navigated document and malformed arguments; accepts a replacement main window')
    } finally {
      ipcMain.removeHandler('app:copy-to-clipboard')
      for (const win of windows) if (!win.isDestroyed()) win.destroy()
      app.quit()
    }
  }).catch(error => { console.error(error); app.exit(1) })
}
