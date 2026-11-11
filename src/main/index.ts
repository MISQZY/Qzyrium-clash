import { app, BrowserWindow } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { watchWindowShortcuts } from './utils/window-shortcuts'
import { registerIpcHandlers } from './ipc/registerHandlers'
import { ServiceManager } from './services/ServiceManager'
import { logger } from './utils/logger'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import { parseSubscriptionImportUrl } from '@shared/clash-url'
import { clearRestartState, readRestartState } from './utils/restart-state'
import { isProcessElevated, restartAsAdmin } from './utils/elevation'

app.setName('Qzyrium-clash')
electronApp.setAppUserModelId('com.qzyrium.vpn')

// Ensure seamless userData directory compatibility with legacy qzyrium-vpn path
try {
  const appData = app.getPath('appData')
  const legacyDir = path.join(appData, 'qzyrium-vpn')
  const currentDir = app.getPath('userData')
  if (!existsSync(currentDir) && existsSync(legacyDir)) {
    app.setPath('userData', legacyDir)
  }
} catch { /* Use default path */ }

function extractProtocolUrl(args: string[]): string | undefined {
  return args.find((arg) => /^(clash|qzyrium|mihomo):\/\//i.test(arg.trim()))
}

function notifyImportProfile(services: ServiceManager, rawUrl: string): void {
  const parsed = parseSubscriptionImportUrl(rawUrl)
  if (parsed.url) {
    const win = services.windowService.getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send(IPC_CHANNELS.EVENT_IMPORT_PROFILE, parsed)
    }
  }
}

// Memory optimization and acceleration switches must be applied before app.ready.
try {
  const boot = JSON.parse(readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8'))
  // Software compositing stalls live Windows resize. Keep GPU acceleration on
  // unless explicitly disabled, independently of memory-saving preferences.
  if (boot.general?.disableGpu === true) app.disableHardwareAcceleration()
} catch { /* First launch uses Electron's normal acceleration settings. */ }

app.commandLine.appendSwitch('gpu-rasterization-msaa-sample-count', '0')
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,BackForwardCache,WinUseBrowserSpellChecker')
app.commandLine.appendSwitch('disable-spellcheck')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128 --optimize_for_size --expose-gc')
app.commandLine.appendSwitch('renderer-process-limit', '1')

let services: ServiceManager | null = null
let shuttingDown = false

function extractAdminRestartPid(): number | null {
  for (const arg of process.argv) {
    if (arg.startsWith('--admin-restart=')) {
      const val = parseInt(arg.slice('--admin-restart='.length), 10)
      if (!isNaN(val) && val > 0) return val
    }
  }
  return null
}

function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  } catch {
    const start = Date.now()
    while (Date.now() - start < ms) { /* busy wait fallback */ }
  }
}

const adminRestartPid = extractAdminRestartPid()
if (adminRestartPid) {
  console.info(`Detected admin relaunch from process ${adminRestartPid}. Waiting for old instance to exit...`)
  const startTime = Date.now()
  while (Date.now() - startTime < 4000) {
    try {
      process.kill(adminRestartPid, 0)
      sleepSync(100)
    } catch {
      break
    }
  }
}

// Enforce single instance lock with retry support for admin restarts
let gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock && adminRestartPid) {
  const retryStart = Date.now()
  while (!gotTheLock && Date.now() - retryStart < 3000) {
    sleepSync(200)
    gotTheLock = app.requestSingleInstanceLock()
  }
}

if (!gotTheLock) {
  console.warn('\n[Qzyrium-clash] Another instance is already running.')
  console.warn('[Qzyrium-clash] If no window is visible, please check the system tray or close existing electron processes in Task Manager.\n')
  app.quit()
} else {
  logger.initialize()
  app.on('second-instance', (_, commandLine) => {
    if (services) {
      services.windowService.show()
      const proto = extractProtocolUrl(commandLine)
      if (proto) {
        notifyImportProfile(services, proto)
      }
    }
  })

  app.whenReady().then(async () => {
    // Set app user model id for windows notifications & taskbar grouping
    electronApp.setAppUserModelId('com.qzyrium.vpn')

    // Register protocol clients for one-click subscription import
    const schemes = ['clash', 'qzyrium', 'mihomo']
    schemes.forEach((scheme) => {
      try {
        if (process.defaultApp) {
          if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])])
          }
        } else {
          if (!app.isDefaultProtocolClient(scheme)) {
            app.setAsDefaultProtocolClient(scheme)
          }
        }
      } catch (err) {
        logger.warn(`Failed to register protocol client for ${scheme}: ${String(err)}`)
      }
    })

    // Default open or close DevTools by F12 in dev and ignore CommandOrControl + R in production
    app.on('browser-window-created', (_, window) => {
      watchWindowShortcuts(window, () => services?.desktopService.isShortcutRecording() ?? false)
    })

    logger.info('Starting Qzyrium-clash application...')

    const restartState = readRestartState()
    if (restartState?.elevated && !isProcessElevated()) {
      if (await restartAsAdmin()) return
      logger.warn('Administrator restart declined; continuing without elevation')
    }
    clearRestartState()
    services = new ServiceManager()
    if (restartState) {
      services.windowService.setStartupVisibility(restartState.visible)
      services.kernelService.setStartupRunning(restartState.running)
      if (restartState.coreOnly) services.windowService.setCoreOnlyMode(true)
    }
    registerIpcHandlers(services)
    await services.initialize()

    const initialProto = extractProtocolUrl(process.argv)
    if (initialProto && services) {
      setTimeout(() => {
        if (services) notifyImportProfile(services, initialProto)
      }, 1500)
    }

    app.on('activate', () => {
      if (services?.windowService.isCoreOnlyMode()) return
      if (BrowserWindow.getAllWindows().length === 0 && services) {
        services.windowService.createWindow()
      }
    })
  })

  app.on('before-quit', async (event) => {
    if (services) {
      event.preventDefault()
      if (shuttingDown) return
      shuttingDown = true
      logger.info('Application quitting, performing cleanup...')
      services.windowService.setQuitting(true)
      await services.dispose()
      services = null
      app.exit(0)
    }
  })

  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception in main process', error)
    if (services) {
      try {
        await services.dispose()
      } catch {}
    }
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection in main process', reason)
  })

  app.on('window-all-closed', () => {
    if (services?.windowService.isCoreOnlyMode()) return
    const minimizeToTray = services?.settingService.getSettings().general.minimizeToTray ?? true
    if (!minimizeToTray || process.platform === 'darwin') {
      app.quit()
    }
  })
}
