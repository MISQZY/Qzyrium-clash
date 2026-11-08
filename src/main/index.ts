import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/registerHandlers'
import { ServiceManager } from './services/ServiceManager'
import { logger } from './utils/logger'

let services: ServiceManager | null = null

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  logger.info('Another instance of QzyriumVPN is already running. Exiting.')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (services) {
      const mainWindow = services.windowService.getMainWindow()
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  app.whenReady().then(async () => {
    // Set app user model id for windows notifications & taskbar grouping
    electronApp.setAppUserModelId('com.qzyrium.vpn')

    // Default open or close DevTools by F12 in dev and ignore CommandOrControl + R in production
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    logger.info('Starting QzyriumVPN application...')

    services = new ServiceManager()
    registerIpcHandlers(services)
    await services.initialize()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && services) {
        services.windowService.createWindow()
      }
    })
  })

  app.on('before-quit', async (event) => {
    if (services) {
      event.preventDefault()
      logger.info('Application quitting, performing cleanup...')
      services.windowService.setQuitting(true)
      await services.dispose()
      services = null
      app.exit(0)
    }
  })

  app.on('window-all-closed', () => {
    // Keep app alive in system tray unless on macOS
    if (process.platform === 'darwin') {
      app.quit()
    }
  })
}
