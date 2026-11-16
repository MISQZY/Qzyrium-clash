import type { NetworkModeController } from './NetworkModeController'
import { app, Menu, nativeImage, Tray, NativeImage, Notification } from 'electron'
import path from 'path'
import { BaseService } from './BaseService'
import { KernelService } from './KernelService'
import { SysProxyService } from './SysProxyService'
import { WindowService } from './WindowService'
import { SettingService } from './SettingService'
import type { ProfileService } from './ProfileService'
import { nativeMessages } from '@shared/localization'
import { getVpnStatus, type VpnStatus } from '@shared/vpn-status'
import { createTrayIcon } from '../utils/tray-icon'
import type { ProxyNode } from '@shared/mihomo'
import type { TunnelMode } from '@shared/types'
import { formatBytes } from '@shared/format'
import type { TrafficStats } from '@shared/types'
import { activateProfile } from '../utils/activate-profile'
import { buildTrayContextMenu } from './TrayMenuBuilder'

export class TrayService implements BaseService {
  private tray: Tray | null = null
  private windowService: WindowService
  private kernelService: KernelService
  private sysProxyService: SysProxyService
  private statusIcons: Partial<Record<VpnStatus, NativeImage>> = {}
  private cachedProxies: Record<string, ProxyNode> = {}
  private isRefreshingProxies = false
  private traffic = { up: 0, down: 0, totalUp: 0, totalDown: 0 }

  constructor(
    windowService: WindowService,
    kernelService: KernelService,
    sysProxyService: SysProxyService,
    private settingService: SettingService,
    private commands: NetworkModeController,
    private profileService?: ProfileService
  ) {
    this.windowService = windowService
    this.kernelService = kernelService
    this.sysProxyService = sysProxyService
  }

  async initialize(): Promise<void> {
    this.createTray()
    if (this.kernelService.getStatus() === 'running') {
      void this.refreshProxies().then(() => this.updateContextMenu())
    }
  }

  async dispose(): Promise<void> {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
    this.statusIcons = {}
    this.cachedProxies = {}
    this.traffic = { up: 0, down: 0, totalUp: 0, totalDown: 0 }
  }

  setProxySelection(group: string, proxy: string): void {
    if (this.cachedProxies[group]) {
      this.cachedProxies[group].now = proxy
    }
    this.updateContextMenu()
  }

  updateTraffic(stats: TrafficStats): void {
    if (!this.tray) return
    const upRate = Math.max(0, Number.isFinite(stats.up) ? stats.up : 0)
    const downRate = Math.max(0, Number.isFinite(stats.down) ? stats.down : 0)
    this.traffic.up = upRate
    this.traffic.down = downRate
    this.traffic.totalUp += upRate
    this.traffic.totalDown += downRate
    if (this.kernelService.getStatus() === 'running') {
      this.updateToolTip()
    }
  }

  private updateToolTip(): void {
    if (!this.tray) return
    const coreStatus = this.kernelService.getStatus()
    const settings = this.settingService.getSettings()
    const messages = nativeMessages(settings.general)
    const locale = settings.general?.language === 'ru' ? 'ru' : 'en'
    const status = getVpnStatus(coreStatus)
    const statusMessage = messages[status === 'on' ? 'vpnOn' : status === 'off' ? 'vpnOff' : status]

    if (coreStatus !== 'running') {
      this.tray.setToolTip(`Qzyrium-clash: ${statusMessage} (${messages[coreStatus]})`)
      return
    }

    const rateUnit = locale === 'ru' ? '/с' : '/s'
    const downRate = `${formatBytes(this.traffic.down, locale)}${rateUnit}`
    const upRate = `${formatBytes(this.traffic.up, locale)}${rateUnit}`
    const downTotal = formatBytes(this.traffic.totalDown, locale)
    const upTotal = formatBytes(this.traffic.totalUp, locale)

    this.tray.setToolTip(
      `Qzyrium-clash: ${statusMessage} (${messages[coreStatus]})\n↓ ${downTotal} (${downRate})   ↑ ${upTotal} (${upRate})`
    )
  }

  clearProxies(): void {
    this.cachedProxies = {}
    this.updateContextMenu()
  }

  async refreshProxies(retries = 2): Promise<void> {
    if (this.isRefreshingProxies) return
    if (typeof this.kernelService?.getProxies !== 'function') return
    if (this.kernelService.getStatus() !== 'running') {
      this.cachedProxies = {}
      return
    }
    this.isRefreshingProxies = true
    try {
      for (let i = 0; i < retries; i++) {
        try {
          const proxies = await this.kernelService.getProxies()
          if (proxies && Object.keys(proxies).length > 0) {
            this.cachedProxies = proxies
            break
          }
        } catch {
          if (i < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 300))
          }
        }
      }
    } finally {
      this.isRefreshingProxies = false
    }
  }

  private async setRoutingMode(mode: TunnelMode): Promise<void> {
    try {
      await this.commands.setRoutingMode(mode)
      this.windowService.broadcast?.('event:settings-changed', null)
      if (this.kernelService.getStatus() === 'running') {
        await this.refreshProxies()
      }
      this.updateContextMenu()
    } catch (err) {
      console.error(`Failed to set routing mode to ${mode}:`, err)
    }
  }

  private async selectProfile(id: string): Promise<void> {
    if (!this.profileService) return
    try {
      await activateProfile(this.profileService, this.kernelService, id)
      if (this.kernelService.getStatus() === 'running') {
        await this.refreshProxies()
      }
      this.updateContextMenu()
    } catch (err) {
      console.error(`Failed to activate profile ${id} from tray:`, err)
    } finally {
      this.windowService.broadcast?.('event:settings-changed', null)
      this.updateContextMenu()
    }
  }

  private async setRoutingType(type: 'off' | 'sysproxy' | 'tun'): Promise<void> {
    try {
      if (type === 'tun') {
        if (typeof this.commands.setTunEnabled === 'function') {
          await this.commands.setTunEnabled(true)
        }
      } else if (type === 'sysproxy') {
        if (typeof this.commands.setSystemProxy === 'function') {
          await this.commands.setSystemProxy(true)
        }
      } else {
        const settings = this.settingService.getSettings()
        if (settings.kernel?.tun?.enable && typeof this.commands.setTunEnabled === 'function') {
          await this.commands.setTunEnabled(false)
        }
        if (typeof this.commands.setSystemProxy === 'function' && (this.sysProxyService.getStatus().enabled || settings.sysProxy?.enable)) {
          await this.commands.setSystemProxy(false)
        }
      }
      this.windowService.broadcast?.('event:settings-changed', null)
    } catch (err) {
      console.error(`Failed to set routing type to ${type}:`, err)
      const settings = this.settingService.getSettings()
      const messages = nativeMessages(settings.general)
      if (type === 'tun' && typeof Notification?.isSupported === 'function' && Notification.isSupported()) {
        new Notification({
          title: 'Qzyrium Clash',
          body: messages.tunRequiresAdmin || (err instanceof Error ? err.message : String(err))
        }).show()
      }
    } finally {
      this.updateContextMenu()
    }
  }

  private createTray(): void {
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
    this.tray.setToolTip('Qzyrium-clash')

    this.tray.on('click', () => {
      this.windowService.show()
    })
    this.tray.on('double-click', () => {
      this.windowService.show()
    })

    this.updateContextMenu()
  }

  updateContextMenu(): void {
    if (!this.tray) return

    const coreStatus = this.kernelService.getStatus()
    const sysProxyStatus = this.sysProxyService.getStatus()
    const settings = this.settingService.getSettings()
    const messages = nativeMessages(settings.general)
    const status = getVpnStatus(coreStatus)
    this.tray.setImage(this.statusIcons[status]!)

    if (coreStatus === 'running' && Object.keys(this.cachedProxies).length === 0 && !this.isRefreshingProxies) {
      void this.refreshProxies().then(() => {
        if (Object.keys(this.cachedProxies).length > 0) {
          this.updateContextMenu()
        }
      })
    } else if (coreStatus !== 'running' && Object.keys(this.cachedProxies).length > 0) {
      this.cachedProxies = {}
    }

    if (coreStatus !== 'running') {
      this.traffic = { up: 0, down: 0, totalUp: 0, totalDown: 0 }
    }
    this.updateToolTip()

    const template = buildTrayContextMenu({
      coreStatus,
      sysProxyStatus,
      settings,
      messages,
      cachedProxies: this.cachedProxies,
      profiles: this.profileService?.getProfiles() || [],
      activeProfileId: this.profileService?.getActiveProfile()?.id,
      isCoreOnly: this.windowService.isCoreOnlyMode(),
      actions: {
        onOpen: () => this.windowService.show(),
        onToggleCore: async () => {
          if (coreStatus === 'running') {
            await this.kernelService.stop()
          } else {
            await this.kernelService.start()
          }
          this.updateContextMenu()
        },
        onSelectProfile: (id) => void this.selectProfile(id),
        onSetRoutingType: (type) => void this.setRoutingType(type),
        onSetRoutingMode: (mode) => void this.setRoutingMode(mode),
        onSelectProxy: async (groupName, nodeName) => {
          if (this.cachedProxies[groupName]?.now === nodeName) return
          try {
            if (typeof this.kernelService.selectProxy === 'function') {
              await this.kernelService.selectProxy(groupName, nodeName)
            }
            this.setProxySelection(groupName, nodeName)
            this.windowService.broadcast?.('event:settings-changed', null)
          } catch (err) {
            console.error(`Failed to select proxy ${nodeName} in group ${groupName}:`, err)
          }
        },
        onToggleCoreOnly: () => this.windowService.setCoreOnlyMode(!this.windowService.isCoreOnlyMode()),
        onRestart: async () => {
          await this.kernelService.restart()
          this.updateContextMenu()
        },
        onQuit: () => {
          this.windowService.setQuitting(true)
          app.quit()
        }
      }
    })

    const contextMenu = Menu.buildFromTemplate(template)
    this.tray.setContextMenu(contextMenu)
  }
}
