import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { getAppPaths } from '../utils/paths'
import { BaseService } from './BaseService'
import { SettingService } from './SettingService'

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

    this.mainWindow = new BrowserWindow({
      width: 1040,
      height: 720,
      minWidth: 840,
      minHeight: 560,
      show: false,
      frame: false,
      titleBarStyle: 'hidden',
      autoHideMenuBar: true,
      backgroundColor: '#0f172a',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
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

    if (isDev) {
      await this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
    } else {
      await this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
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
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore()
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  async openFolder(target: 'logs' | 'data' | 'profiles'): Promise<void> {
    const paths = getAppPaths()
    let folder = paths.userData
    if (target === 'logs') folder = paths.logsDir
    if (target === 'profiles') folder = paths.profilesDir
    await shell.openPath(folder)
  }
}
