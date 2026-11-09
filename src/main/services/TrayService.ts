import { app, Menu, nativeImage, Tray, NativeImage } from 'electron'
import path from 'path'
import { BaseService } from './BaseService'
import { KernelService } from './KernelService'
import { SysProxyService } from './SysProxyService'
import { WindowService } from './WindowService'
import { SettingService } from './SettingService'
import en from '@shared/locales/en.json'
import ru from '@shared/locales/ru.json'
import { getVpnStatus, type VpnStatus } from '@shared/vpn-status'
import { createTrayIcon } from '../utils/tray-icon'

export class TrayService implements BaseService {
  private tray: Tray | null = null
  private windowService: WindowService
  private kernelService: KernelService
  private sysProxyService: SysProxyService
  private statusIcons: Partial<Record<VpnStatus, NativeImage>> = {}

  constructor(
    windowService: WindowService,
    kernelService: KernelService,
    sysProxyService: SysProxyService,
    private settingService: SettingService
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
    this.statusIcons = {}
  }

  private createTray(): void {
    // Generate a default 16x16 icon in memory if file is not found
    let icon: NativeImage
    const iconPath = path.join(app.getAppPath(), 'resources', 'icon.png')

    try {
      icon = nativeImage.createFromPath(iconPath)
      if (icon.isEmpty()) {
        icon = nativeImage.createEmpty()
      }
    } catch {
      icon = nativeImage.createEmpty()
    }

    for (const status of ['on', 'off', 'starting', 'error'] as const) {
      this.statusIcons[status] = createTrayIcon(icon, status)
    }
    this.tray = new Tray(this.statusIcons.off!)
    this.tray.setToolTip('Qzyrium - clash')

    this.tray.on('click', () => {
      this.windowService.show()
    })

    this.updateContextMenu()
  }

  updateContextMenu(): void {
    if (!this.tray) return

    const coreStatus = this.kernelService.getStatus()
    const sysProxyStatus = this.sysProxyService.getStatus()
    const settings = this.settingService.getSettings()
    const messages = settings.general.language === 'ru' ? ru : en
    const status = getVpnStatus(coreStatus)
    const statusMessage = messages[status === 'on' ? 'vpnOn' : status === 'off' ? 'vpnOff' : status]
    this.tray.setImage(this.statusIcons[status]!)
    this.tray.setToolTip(`Qzyrium - clash: ${statusMessage} (${messages[coreStatus]})`)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Qzyrium - clash [${messages[coreStatus]}]`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: coreStatus === 'running' ? messages.disconnect : messages.connect,
        click: async () => {
          if (coreStatus === 'running') {
            await this.kernelService.stop()
          } else {
            await this.kernelService.start()
          }
          this.updateContextMenu()
        }
      },
      {
        label: messages.open,
        click: () => this.windowService.show()
      },
      {
        label: `${messages.proxy} (${sysProxyStatus.enabled ? messages.on : messages.off})`,
        click: async () => {
          await this.sysProxyService.setSysProxy(!sysProxyStatus.enabled)
          this.updateContextMenu()
        }
      },
      { type: 'separator' },
      {
        label: messages.restart,
        click: async () => {
          await this.kernelService.restart()
          this.updateContextMenu()
        }
      },
      {
        label: messages.quit,
        click: () => {
          this.windowService.setQuitting(true)
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)
  }
}
