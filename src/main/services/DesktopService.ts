import { app, globalShortcut } from 'electron'
import type { AppConfig } from '@shared/app-config'
import type { BaseService } from './BaseService'
import type { SettingService } from './SettingService'
import type { ProfileService } from './ProfileService'
import type { KernelService } from './KernelService'
import type { SysProxyService } from './SysProxyService'
import type { WindowService } from './WindowService'
import { logger } from '../utils/logger'
import { isProcessElevated } from '../utils/elevation'

export class DesktopService implements BaseService {
  private shortcuts = new Map<string, string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private updating: Promise<void> | null = null
  private disposed = false
  private actionPending: Promise<void> | null = null
  private profileUpdateTimes = new Map<string, number>()

  constructor(private settings: SettingService, private profiles: ProfileService, private kernel: KernelService, private proxy: SysProxyService, private window: WindowService, private changed: () => void) {}

  async initialize(): Promise<void> { this.applySettings(this.settings.getSettings()) }

  applySettings(config: AppConfig): void {
    const previous = this.shortcuts
    for (const accelerator of previous.values()) globalShortcut.unregister(accelerator)
    const registered = new Map<string, string>()
    try {
      for (const [action, accelerator] of Object.entries(config.general.shortcuts ?? {})) {
        if (!accelerator.trim()) continue
        if (!globalShortcut.register(accelerator, () => this.trigger(action))) throw new Error(`Shortcut is unavailable: ${accelerator}`)
        registered.set(action, accelerator)
      }
      // Electron development binaries are not valid installed login targets.
      if (app.isPackaged && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: config.general.autoStart })
      this.shortcuts = registered
      this.schedule(config)
    } catch (err) {
      for (const accelerator of registered.values()) globalShortcut.unregister(accelerator)
      for (const [action, accelerator] of previous) globalShortcut.register(accelerator, () => this.trigger(action))
      throw err
    }
  }

  private trigger(action: string): void {
    if (this.disposed) return
    if (action === 'showWindow') { this.window.show(); return }
    if (this.actionPending || this.disposed) return
    this.actionPending = this.runAction(action).then(() => this.changed()).catch((err) => logger.error(`Shortcut ${action} failed`, err)).finally(() => { this.actionPending = null })
  }

  private async runAction(action: string): Promise<void> {
    const settings = this.settings.getSettings()
    if (action === 'sysProxy') {
      const next = !this.proxy.getStatus().enabled
      if (next && settings.kernel.tun.enable) {
        await this.settings.updateSettings({ kernel: { ...settings.kernel, tun: { ...settings.kernel.tun, enable: false } } })
        if (['running', 'starting'].includes(this.kernel.getStatus())) await this.kernel.restart()
      }
      await this.proxy.setSysProxy(next)
      return
    }
    if (action === 'tun') {
      const next = !settings.kernel.tun.enable
      if (next) {
        if (!isProcessElevated()) {
          logger.warn('Shortcut cannot enable TUN: Administrator privileges required')
          return
        }
        if (settings.sysProxy.enable || this.proxy.getStatus().enabled) {
          await this.proxy.setSysProxy(false)
        }
      }
      await this.settings.updateSettings({ kernel: { ...settings.kernel, tun: { ...settings.kernel.tun, enable: next } } })
      if (['running', 'starting'].includes(this.kernel.getStatus())) await this.kernel.restart()
      return
    }
    const mode = action === 'ruleMode' ? 'rule' : action === 'globalMode' ? 'global' : action === 'directMode' ? 'direct' : undefined
    if (mode) {
      if (this.kernel.getStatus() === 'running') await this.kernel.patchConfigs({ mode })
      await this.settings.updateSettings({ kernel: { ...settings.kernel, mode } })
    }
  }

  private schedule(config = this.settings.getSettings()): void {
    clearTimeout(this.timer)
    if (this.disposed || !config.general.autoUpdateProfiles || this.updating) return
    this.timer = setTimeout(() => {
      this.updating = this.updateSubscriptions().finally(() => { this.updating = null; this.schedule() })
    }, Math.min(config.general.profileUpdateInterval ?? 60, ...this.profiles.getProfiles()
      .filter((profile) => profile.type === 'remote' && profile.autoUpdate !== false)
      .map((profile) => profile.interval ?? config.general.profileUpdateInterval ?? 60)) * 60_000)
    this.timer.unref()
  }

  private async updateSubscriptions(): Promise<void> {
    let changedActive = false
    for (const profile of this.profiles.getProfiles()) {
      if (this.disposed || !this.settings.getSettings().general.autoUpdateProfiles) break
      if (profile.type !== 'remote' || profile.autoUpdate === false) continue
      const interval = profile.interval ?? this.settings.getSettings().general.profileUpdateInterval ?? 60
      const lastUpdate = this.profileUpdateTimes.get(profile.id) ?? profile.updatedAt ?? 0
      if (Date.now() - lastUpdate < interval * 60_000) continue
      this.profileUpdateTimes.set(profile.id, Date.now())
      try {
        const changed = await this.profiles.updateProfile(profile.id)
        if (changed && this.profiles.getActiveProfile()?.id === profile.id) changedActive = true
      } catch (err) { logger.warn(`Background subscription update failed: ${profile.id}: ${err instanceof Error ? err.message : String(err)}`) }
    }
    if (this.disposed) return
    if (changedActive && ['running', 'starting'].includes(this.kernel.getStatus())) {
      try { await this.kernel.restart() } catch (err) { logger.error('Applying updated subscription failed', err) }
    }
    this.changed()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    clearTimeout(this.timer)
    for (const accelerator of this.shortcuts.values()) globalShortcut.unregister(accelerator)
    this.shortcuts.clear()
    await Promise.all([this.updating, this.actionPending])
  }
}
