import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { SettingService } from './SettingService'
import { IPC_CHANNELS } from '@shared/ipc'
import type { ThemeStore } from './ThemeStore'
import { bootAppearance } from '@shared/appearance'
import { watchWindowScale } from '../utils/window-scale'
import { trimProcessMemory } from '../utils/memory'

export class WindowService implements BaseService {
  getRendererUrl(): string {
    return !app.isPackaged && process.env.ELECTRON_RENDERER_URL
      ? process.env.ELECTRON_RENDERER_URL
      : pathToFileURL(path.join(__dirname, '../renderer/index.html')).href
  }

  private mainWindow: BrowserWindow | null = null
  private settingService: SettingService
  private isQuitting = false
  private startHidden = false
  private ready = false
  private coreOnly = false
  private modeChanged?: () => void
  private startupVisible?: boolean
  private visibilityHandler?: (visible: boolean) => void

  constructor(settingService: SettingService, private themeStore?: ThemeStore) {
    this.settingService = settingService
  }

  setVisibilityHandler(handler: (visible: boolean) => void): void {
    this.visibilityHandler = handler
  }

  setModeChangedHandler(handler: () => void): void { this.modeChanged = handler }

  isCoreOnlyMode(): boolean { return this.coreOnly }

  setStartupVisibility(visible: boolean): void { this.startupVisible = visible }

  setCoreOnlyMode(enabled: boolean): void {
    if (this.isQuitting || this.coreOnly === enabled) return
    this.coreOnly = enabled
    if (enabled) {
      this.ready = false
      this.visibilityHandler?.(false)
      const window = this.mainWindow
      this.mainWindow = null
      // Destroy the renderer, bypassing the normal close-to-tray behavior.
      window?.destroy()
      setTimeout(() => {
        void trimProcessMemory()
      }, 500)
    } else {
      this.show()
    }
    this.modeChanged?.()
  }

  async initialize(): Promise<void> {
    nativeTheme.on('updated', this.updateTheme)
    if (this.coreOnly) return
    this.startHidden = this.startupVisible === undefined ? !!this.settingService.getSettings().general.silentStart : !this.startupVisible
    await this.createWindow()
    if (this.startHidden) {
      this.visibilityHandler?.(false)
    }
  }

  async dispose(): Promise<void> {
    nativeTheme.removeListener('updated', this.updateTheme)
    this.isQuitting = true
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close()
    }
  }

  setQuitting(val: boolean): void {
    this.isQuitting = val
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  updateTheme = (): void => {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    const { theme: preference, language } = this.settingService.getSettings().general
    const appearance = bootAppearance(preference, language, this.themeStore?.listThemes() ?? [], nativeTheme.shouldUseDarkColors)
    this.mainWindow.setBackgroundColor(appearance.backgroundColor)
    if (process.platform === 'win32') {
      this.mainWindow.setTitleBarOverlay({ color: '#00000000', symbolColor: appearance.theme.titleBarOverlay.symbolColor, height: 36 })
    }
  }

  setTitleBarOverlay = (overlay: { color?: string; symbolColor?: string }): void => {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    if (process.platform === 'win32') {
      this.mainWindow.setTitleBarOverlay({
        color: '#00000000',
        symbolColor: overlay.symbolColor ?? '#b4b9b7',
        height: 36
      })
    }
  }

  broadcast(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  async createWindow(): Promise<BrowserWindow> {
    this.ready = false
    const { theme, language } = this.settingService.getSettings().general
    const appearance = bootAppearance(theme, language, this.themeStore?.listThemes() ?? [], nativeTheme.shouldUseDarkColors)

    const titleBarOverlay = process.platform === 'win32'
      ? { color: '#00000000', symbolColor: appearance.theme.titleBarOverlay.symbolColor, height: 36 }
      : undefined

    this.mainWindow = new BrowserWindow({
      title: 'Qzyrium-clash',
      icon: path.join(app.getAppPath(), 'resources', 'icon.png'),
      width: 1040,
      height: 720,
      minWidth: 840,
      minHeight: 620,
      show: false,
      center: true,
      titleBarStyle: 'hidden',
      titleBarOverlay,
      autoHideMenuBar: true,
      backgroundColor: appearance.backgroundColor,
      webPreferences: {
        additionalArguments: [`--qzyrium-appearance=${encodeURIComponent(JSON.stringify(appearance))}`],
        spellcheck: false,
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true
      }
    })

    watchWindowScale(this.mainWindow)

    // Deny all unsolicited web API permissions
    this.mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    this.mainWindow.webContents.session.setPermissionCheckHandler(() => false)

    // Navigation security guards: block navigating the top frame or subframes away from app
    this.mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
      const devUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
      if (devUrl) {
        if (!navigationUrl.startsWith(devUrl)) {
          event.preventDefault()
          logger.warn(`Blocked unauthorized navigation attempt to: ${navigationUrl}`)
        }
      } else {
        try {
          const parsed = new URL(navigationUrl)
          const allowedFilePath = path.resolve(__dirname, '../renderer/index.html')
          if (parsed.protocol !== 'file:' || path.resolve(fileURLToPath(parsed)) !== allowedFilePath) {
            event.preventDefault()
            logger.warn(`Blocked unauthorized navigation attempt to: ${navigationUrl}`)
          }
        } catch {
          event.preventDefault()
          logger.warn(`Blocked malformed navigation attempt: ${navigationUrl}`)
        }
      }
    })
    this.mainWindow.webContents.on('will-frame-navigate', (event) => {
      event.preventDefault()
    })

    this.updateTheme()

    this.mainWindow.on('ready-to-show', () => {
      logger.info('Main window ready-to-show event fired')
      this.ready = true
      if (this.startHidden) return
      this.show()
    })

    this.mainWindow.webContents.on('did-finish-load', () => {
      logger.info('Main window did-finish-load event fired')
    })

    this.mainWindow.webContents.on('console-message', (event) => {
      logger.info(`[Renderer Console] [${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`)
    })

    this.mainWindow.webContents.on('render-process-gone', (_, details) => {
      logger.error(`Renderer process gone: ${details.reason} (exitCode: ${details.exitCode})`)
      if (details.reason !== 'clean-exit') {
        setTimeout(() => this.mainWindow?.reload(), 300)
      }
    })

    this.mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      logger.error(`Main window did-fail-load: ${errorCode} ${errorDescription} (${validatedURL})`)
      if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
        setTimeout(() => {
          this.mainWindow?.loadURL(process.env.ELECTRON_RENDERER_URL!)
        }, 500)
      }
    })

    this.mainWindow.on('close', (e) => {
      const settings = this.settingService.getSettings()
      if (!this.isQuitting && settings.general.minimizeToTray) {
        e.preventDefault()
        this.mainWindow?.hide()
      }
    })

    this.mainWindow.on('hide', () => {
      this.broadcast(IPC_CHANNELS.EVENT_WINDOW_VISIBILITY, false)
      this.visibilityHandler?.(false)
    })

    this.mainWindow.on('show', () => {
      this.broadcast(IPC_CHANNELS.EVENT_WINDOW_VISIBILITY, true)
      this.visibilityHandler?.(true)
    })

    this.mainWindow.on('minimize', () => {
      this.broadcast(IPC_CHANNELS.EVENT_WINDOW_VISIBILITY, false)
      this.visibilityHandler?.(false)
    })

    this.mainWindow.on('restore', () => {
      this.broadcast(IPC_CHANNELS.EVENT_WINDOW_VISIBILITY, true)
      this.visibilityHandler?.(true)
    })

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      try {
        const parsed = new URL(details.url)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          void shell.openExternal(details.url)
        } else {
          logger.warn(`Blocked opening unsafe external URL scheme: ${parsed.protocol}`)
        }
      } catch {
        logger.warn(`Blocked invalid external URL: ${details.url}`)
      }
      return { action: 'deny' }
    })

    logger.info(`Loading renderer: ELECTRON_RENDERER_URL=${process.env.ELECTRON_RENDERER_URL}`)
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    return this.mainWindow
  }

  minimize(): void {
    this.mainWindow?.minimize()
  }

  maximize(): void {
    if (this.mainWindow?.isMaximized()) {
      this.mainWindow.unmaximize()
    } else {
      this.mainWindow?.maximize()
    }
  }

  close(): void {
    const settings = this.settingService.getSettings()
    if (settings.general.minimizeToTray) {
      this.mainWindow?.hide()
    } else {
      app.quit()
    }
  }

  show(): void {
    if (this.isQuitting) return
    if (this.coreOnly) {
      this.coreOnly = false
      this.modeChanged?.()
    }
    this.startHidden = false
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      void this.createWindow()
      return
    }
    if (!this.ready) return
    if (this.mainWindow.isMinimized()) this.mainWindow.restore()
    this.mainWindow.show()
    this.mainWindow.focus()
  }

  async openFolder(target: 'logs' | 'appLogs' | 'connectionLogs' | 'data' | 'profiles'): Promise<void> {
    const paths = getAppPaths()
    let folder = paths.userData
    if (target === 'logs') folder = paths.logsDir
    if (target === 'appLogs') folder = path.join(paths.logsDir, 'app')
    if (target === 'connectionLogs') folder = path.join(paths.logsDir, 'connections')
    if (target === 'profiles') folder = paths.profilesDir
    const error = await shell.openPath(folder)
    if (error) throw new Error(error)
  }
}
