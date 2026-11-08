import { app, Menu, nativeImage, Tray, NativeImage } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'
import { BaseService } from './BaseService'
import { KernelService } from './KernelService'
import { SysProxyService } from './SysProxyService'
import { WindowService } from './WindowService'

export class TrayService implements BaseService {
  private tray: Tray | null = null
  private windowService: WindowService
  private kernelService: KernelService
  private sysProxyService: SysProxyService

  constructor(
    windowService: WindowService,
    kernelService: KernelService,
    sysProxyService: SysProxyService
  ) {
    this.windowService = windowService
    this.kernelService = kernelService
    this.sysProxyService = sysProxyService
  }

  async initialize(): Promise<void> {
    this.createTray()
  }

  async dispose(): Promise<void> {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  private createTray(): void {
    // Generate a default 16x16 icon in memory if file is not found
    let icon: NativeImage
    const iconPath = is.dev
      ? path.join(app.getAppPath(), 'resources', 'icon.png')
      : path.join(process.resourcesPath, 'icon.png')

    try {
      icon = nativeImage.createFromPath(iconPath)
      if (icon.isEmpty()) {
        icon = nativeImage.createEmpty()
      }
    } catch {
      icon = nativeImage.createEmpty()
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('QzyriumVPN')

    this.tray.on('click', () => {
      this.windowService.show()
    })

    this.updateContextMenu()
  }

  updateContextMenu(): void {
    if (!this.tray) return

    const coreStatus = this.kernelService.getStatus()
    const sysProxyStatus = this.sysProxyService.getStatus()

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `QzyriumVPN [${coreStatus.toUpperCase()}]`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => this.windowService.show()
      },
      {
        label: `System Proxy (${sysProxyStatus.enabled ? 'ON' : 'OFF'})`,
        click: async () => {
          await this.sysProxyService.setSysProxy(!sysProxyStatus.enabled)
          this.updateContextMenu()
        }
      },
      { type: 'separator' },
      {
        label: 'Restart Core',
        click: async () => {
          await this.kernelService.restart()
          this.updateContextMenu()
        }
      },
      {
        label: 'Quit',
        click: () => {
          this.windowService.setQuitting(true)
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)
  }
}
