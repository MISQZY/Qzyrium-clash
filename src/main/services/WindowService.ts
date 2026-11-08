import { app, BrowserWindow, shell } from 'electron'
import { execFile } from 'child_process'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { getAppPaths } from '../utils/paths'
import { logger } from '../utils/logger'
import { BaseService } from './BaseService'
import { SettingService } from './SettingService'

const DWMWA_TRANSITIONS_FORCEDISABLED = 3

function disableWindowTransitionAnimations(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  try {
    const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0)
    const script = `Add-Type -Namespace N -Name Dwm -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);'; $v = 1; [N.Dwm]::DwmSetWindowAttribute([IntPtr]${hwnd}, ${DWMWA_TRANSITIONS_FORCEDISABLED}, [ref]$v, 4) | Out-Null`
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true },
      (error) => {
        if (error) logger.warn(`Failed to disable window transition animations: ${error.message}`)
      }
    )
  } catch (err) {
    logger.error('Error querying window handle for DWM setup', err)
  }
}

export class WindowService implements BaseService {
  private mainWindow: BrowserWindow | null = null
  private settingService: SettingService
  private isQuitting = false

  constructor(settingService: SettingService) {
    this.settingService = settingService
  }

  async initialize(): Promise<void> {
    await this.createWindow()
  }

  async dispose(): Promise<void> {
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

  broadcast(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  async createWindow(): Promise<BrowserWindow> {
    const isDev = is.dev && process.env['ELECTRON_RENDERER_URL']

    const titleBarOverlay = process.platform === 'win32'
      ? { color: '#161c1a', symbolColor: '#9ca3af', height: 36 }
      : undefined

    this.mainWindow = new BrowserWindow({
      width: 1040,
      height: 720,
      minWidth: 840,
      minHeight: 560,
      show: true,
      center: true,
      titleBarStyle: 'hidden',
      titleBarOverlay,
      autoHideMenuBar: true,
      backgroundColor: '#121615',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })

    disableWindowTransitionAnimations(this.mainWindow)

    this.mainWindow.on('ready-to-show', () => {
      logger.info('Main window ready-to-show event fired')
      this.mainWindow?.show()
      this.mainWindow?.focus()
    })

    this.mainWindow.webContents.on('did-finish-load', () => {
      logger.info('Main window did-finish-load event fired')
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

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
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
      if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isVisible()) {
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
