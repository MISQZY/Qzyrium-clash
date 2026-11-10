import { app, Menu, nativeImage, Tray, NativeImage } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import path from 'path'
import { BaseService } from './BaseService'
import { KernelService } from './KernelService'
import { SysProxyService } from './SysProxyService'
import { WindowService } from './WindowService'
import { SettingService } from './SettingService'
import { nativeMessages } from '@shared/localization'
import { getVpnStatus, type VpnStatus } from '@shared/vpn-status'
import { createTrayIcon } from '../utils/tray-icon'
import type { ProxyNode, ProxyGroup } from '@shared/mihomo'
import type { TunnelMode } from '@shared/types'

export class TrayService implements BaseService {
  private tray: Tray | null = null
  private windowService: WindowService
  private kernelService: KernelService
  private sysProxyService: SysProxyService
  private statusIcons: Partial<Record<VpnStatus, NativeImage>> = {}
  private cachedProxies: Record<string, ProxyNode> = {}
  private isRefreshingProxies = false

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
  }

  setProxySelection(group: string, proxy: string): void {
    if (this.cachedProxies[group]) {
      this.cachedProxies[group].now = proxy
    }
    this.updateContextMenu()
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
      if (this.kernelService.getStatus() === 'running' && typeof this.kernelService.patchConfigs === 'function') {
        await this.kernelService.patchConfigs({ mode })
      }
      const settings = this.settingService.getSettings()
      if (typeof this.settingService.updateSettings === 'function') {
        await this.settingService.updateSettings({
          kernel: { ...settings.kernel, mode }
        })
      }
      this.windowService.broadcast?.('event:settings-changed', null)
      if (this.kernelService.getStatus() === 'running') {
        await this.refreshProxies()
      }
      this.updateContextMenu()
    } catch (err) {
      console.error(`Failed to set routing mode to ${mode}:`, err)
    }
  }

  private buildModeMenu(
    currentMode: TunnelMode,
    messages: Record<string, string>
  ): MenuItemConstructorOptions {
    const modeNames: Record<TunnelMode, string> = {
      rule: messages.modeRule || 'Rule',
      global: messages.modeGlobal || 'Global',
      direct: messages.modeDirect || 'Direct'
    }
    const currentName = modeNames[currentMode] || messages.modeRule || 'Rule'

    return {
      label: `${messages.routingMode || 'Routing mode'} (${currentName})`,
      submenu: [
        {
          label: messages.modeRule || 'Rule',
          type: 'radio',
          checked: currentMode === 'rule',
          click: () => void this.setRoutingMode('rule')
        },
        {
          label: messages.modeGlobal || 'Global',
          type: 'radio',
          checked: currentMode === 'global',
          click: () => void this.setRoutingMode('global')
        },
        {
          label: messages.modeDirect || 'Direct',
          type: 'radio',
          checked: currentMode === 'direct',
          click: () => void this.setRoutingMode('direct')
        }
      ]
    }
  }

  private buildProxyGroupMenus(
    currentMode: TunnelMode,
    isRunning: boolean
  ): MenuItemConstructorOptions[] {
    if (!isRunning) {
      return []
    }

    const eligibleGroupNames: string[] = []
    for (const [name, node] of Object.entries(this.cachedProxies)) {
      const group = node as unknown as ProxyGroup
      if (!group || !Array.isArray(group.all) || group.all.length === 0) continue
      if (group.hidden) continue
      const rawType = (group.type || '').toLowerCase()
      if (rawType !== 'selector' && rawType !== 'select') continue
      if (name === 'GLOBAL' && currentMode !== 'global') continue
      eligibleGroupNames.push(name)
    }

    if (eligibleGroupNames.length === 0 && this.cachedProxies['GLOBAL']) {
      const g = this.cachedProxies['GLOBAL'] as unknown as ProxyGroup
      const rawType = (g.type || '').toLowerCase()
      if ((rawType === 'selector' || rawType === 'select') && Array.isArray(g.all) && g.all.length > 0) {
        eligibleGroupNames.push('GLOBAL')
      }
    }

    if (eligibleGroupNames.length === 0) {
      return []
    }

    eligibleGroupNames.sort((a, b) => {
      if (currentMode === 'global') {
        if (a === 'GLOBAL') return -1
        if (b === 'GLOBAL') return 1
      }
      return a.localeCompare(b)
    })

    return eligibleGroupNames.map((groupName) => {
      const group = this.cachedProxies[groupName] as unknown as ProxyGroup
      const activeNode = group.now ? (group.now.length > 30 ? `${group.now.slice(0, 27)}...` : group.now) : ''
      const groupLabel = activeNode ? `${groupName}: ${activeNode}` : groupName

      const nodeItems: MenuItemConstructorOptions[] = (group.all || []).map((nodeName: string) => {
        const isSelected = group.now === nodeName
        const displayLabel = nodeName.length > 50 ? `${nodeName.slice(0, 47)}...` : nodeName
        return {
          label: displayLabel,
          type: 'radio',
          checked: isSelected,
          click: async () => {
            if (group.now === nodeName) return
            try {
              if (typeof this.kernelService.selectProxy === 'function') {
                await this.kernelService.selectProxy(groupName, nodeName)
              }
              this.setProxySelection(groupName, nodeName)
              this.windowService.broadcast?.('event:settings-changed', null)
            } catch (err) {
              console.error(`Failed to select proxy ${nodeName} in group ${groupName}:`, err)
            }
          }
        }
      })

      return {
        label: groupLabel,
        submenu: nodeItems
      }
    })
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
    this.tray.setToolTip('Qzyrium-clash')

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
    const messages = nativeMessages(settings.general)
    const status = getVpnStatus(coreStatus)
    const statusMessage = messages[status === 'on' ? 'vpnOn' : status === 'off' ? 'vpnOff' : status]
    this.tray.setImage(this.statusIcons[status]!)
    this.tray.setToolTip(`Qzyrium-clash: ${statusMessage} (${messages[coreStatus]})`)

    if (coreStatus === 'running' && Object.keys(this.cachedProxies).length === 0 && !this.isRefreshingProxies) {
      void this.refreshProxies().then(() => {
        if (Object.keys(this.cachedProxies).length > 0) {
          this.updateContextMenu()
        }
      })
    } else if (coreStatus !== 'running' && Object.keys(this.cachedProxies).length > 0) {
      this.cachedProxies = {}
    }

    const currentMode: TunnelMode = (settings.kernel?.mode as TunnelMode) || 'rule'
    const isRunning = coreStatus === 'running'
    const proxyGroupMenus = this.buildProxyGroupMenus(currentMode, isRunning)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Qzyrium-clash [${messages[coreStatus]}]`,
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
        label: messages.coreOnlyMode,
        type: 'checkbox',
        checked: this.windowService.isCoreOnlyMode(),
        click: () => this.windowService.setCoreOnlyMode(!this.windowService.isCoreOnlyMode())
      },
      {
        label: `${messages.proxy} (${sysProxyStatus.enabled ? messages.on : messages.off})`,
        click: async () => {
          await this.sysProxyService.setSysProxy(!sysProxyStatus.enabled)
          this.updateContextMenu()
        }
      },
      { type: 'separator' },
      this.buildModeMenu(currentMode, messages),
      ...proxyGroupMenus,
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
