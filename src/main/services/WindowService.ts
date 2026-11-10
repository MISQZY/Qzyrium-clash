import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { execFile } from 'child_process'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { SettingService } from './SettingService'
import { IPC_CHANNELS } from '@shared/ipc'

const DWMWA_TRANSITIONS_FORCEDISABLED = 3

function runEncodedPowerShell(script: string, onError?: (err: Error) => void): void {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
    { windowsHide: true },
    (error) => {
      if (error && onError) onError(error)
    }
  )
}

function disableWindowTransitionAnimations(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  try {
    const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0)
    const script = `
Add-Type -Namespace N -Name Dwm -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);'
$v = 1
[N.Dwm]::DwmSetWindowAttribute([IntPtr]${hwnd}, ${DWMWA_TRANSITIONS_FORCEDISABLED}, [ref]$v, 4) | Out-Null
`
    runEncodedPowerShell(script, (error) => {
      logger.warn(`Failed to disable window transition animations: ${error.message}`)
    })
  } catch (err) {
    logger.error('Error querying window handle for DWM setup', err)
  }
}

export class WindowService implements BaseService {
  private mainWindow: BrowserWindow | null = null
  private settingService: SettingService
  private isQuitting = false
  private startHidden = false
  private visibilityHandler?: (visible: boolean) => void

  constructor(settingService: SettingService) {
    this.settingService = settingService
  }

  setVisibilityHandler(handler: (visible: boolean) => void): void {
    this.visibilityHandler = handler
  }

  async initialize(): Promise<void> {
    this.startHidden = !!this.settingService.getSettings().general.silentStart
    await this.createWindow()
    if (this.startHidden) {
      this.visibilityHandler?.(false)
    }
    nativeTheme.on('updated', this.updateTheme)
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
    const theme = this.settingService.getSettings().general.theme
    const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
    this.mainWindow.setBackgroundColor(dark ? '#121615' : '#f7f9f8')
    if (process.platform === 'win32') {
      this.mainWindow.setTitleBarOverlay({ color: '#00000000', symbolColor: dark ? '#b4b9b7' : '#636a67', height: 36 })
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
    const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']

    const titleBarOverlay = process.platform === 'win32'
      ? { color: '#00000000', symbolColor: '#b4b9b7', height: 36 }
      : undefined

    this.mainWindow = new BrowserWindow({
      title: 'Qzyrium - clash',
      icon: path.join(app.getAppPath(), 'resources', 'icon.png'),
      width: 1040,
      height: 720,
      minWidth: 840,
      minHeight: 620,
      show: !this.startHidden,
      center: true,
      titleBarStyle: 'hidden',
      titleBarOverlay,
      autoHideMenuBar: true,
      backgroundColor: '#121615',
      webPreferences: {
        spellcheck: false,
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true
      }
    })

    // Deny all unsolicited web API permissions
    this.mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    this.mainWindow.webContents.session.setPermissionCheckHandler(() => false)

    // Navigation security guards: block navigating the top frame or subframes away from app
    this.mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
      const allowedOrigin = process.env.ELECTRON_RENDERER_URL || 'file://'
      if (!navigationUrl.startsWith(allowedOrigin)) {
        event.preventDefault()
        logger.warn(`Blocked unauthorized navigation attempt to: ${navigationUrl}`)
      }
    })
    this.mainWindow.webContents.on('will-frame-navigate', (event) => {
      event.preventDefault()
    })

    disableWindowTransitionAnimations(this.mainWindow)
    this.updateTheme()

    this.mainWindow.on('ready-to-show', () => {
      logger.info('Main window ready-to-show event fired')
      if (this.startHidden) return
      this.mainWindow?.show()
      this.mainWindow?.focus()
    })

    this.mainWindow.webContents.on('did-finish-load', () => {
      logger.info('Main window did-finish-load event fired')
      if (this.startHidden) return
      this.mainWindow?.show()
      this.mainWindow?.focus()
    })

    this.mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
      logger.info(`[Renderer Console] [${level}] ${message} (${sourceId}:${line})`)
    })

    this.mainWindow.webContents.on('render-process-gone', (_, details) => {
      logger.error(`Renderer process gone: ${details.reason} (exitCode: ${details.exitCode})`)
      if (details.reason !== 'clean-exit') {
        setTimeout(() => this.mainWindow?.reload(), 300)
      }
    })

    this.mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      logger.error(`Main window did-fail-load: ${errorCode} ${errorDescription} (${validatedURL})`)
      if (process.env.ELECTRON_RENDERER_URL) {
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
      const settings = this.settingService.getSettings()
      if (settings.general.minimizeToTray) {
        this.mainWindow?.hide()
      } else {
        this.broadcast(IPC_CHANNELS.EVENT_WINDOW_VISIBILITY, false)
        this.visibilityHandler?.(false)
      }
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
    if (process.env.ELECTRON_RENDERER_URL) {
      this.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    // Force show fallback so the window is NEVER invisible
    setTimeout(() => {
      if (!this.startHidden && this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isVisible()) {
        logger.info('Fallback showing main window after timeout')
        this.mainWindow.show()
      }
    }, 1000)

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
    this.startHidden = false
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      void this.createWindow()
      return
    }
    if (this.mainWindow.isMinimized()) this.mainWindow.restore()
    this.mainWindow.show()
    this.mainWindow.focus()
  }

  async openFolder(target: 'logs' | 'data' | 'profiles'): Promise<void> {
    const paths = getAppPaths()
    let folder = paths.userData
    if (target === 'logs') folder = paths.logsDir
    if (target === 'profiles') folder = paths.profilesDir
    await shell.openPath(folder)
  }
}
