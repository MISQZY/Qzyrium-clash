import { app, globalShortcut } from 'electron'
import type { AppConfig } from '@shared/app-config'
import type { BaseService } from './BaseService'
import type { SettingService } from './SettingService'
import type { ProfileService } from './ProfileService'
import type { KernelService } from './KernelService'
import type { SysProxyService } from './SysProxyService'
import type { WindowService } from './WindowService'
import { logger } from '../utils/logger'
import type { NetworkModeController } from './NetworkModeController'
import { applyWindowsStartup } from '../utils/windows-startup'

export class DesktopService implements BaseService {
  private shortcuts = new Map<string, string>()
  private recordingShortcut = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private updating: Promise<void> | null = null
  private disposed = false
  private actionPending: Promise<void> | null = null
  private profileUpdateTimes = new Map<string, number>()
  private startupApplied: string | null = null

  constructor(private settings: SettingService, private profiles: ProfileService, private kernel: KernelService, private proxy: SysProxyService, private window: WindowService, private changed: () => void, private commands: NetworkModeController) {}

  async initialize(): Promise<void> {
    this.disposed = false
    await this.applySettings(this.settings.getSettings())
  }

  async applySettings(config: AppConfig): Promise<void> {
    const previous = this.shortcuts
    for (const accelerator of previous.values()) globalShortcut.unregister(accelerator)
    const registered = new Map<string, string>()
    try {
      for (const [action, accelerator] of Object.entries(config.general.shortcuts ?? {})) {
        if (!accelerator.trim()) continue
        if (!this.recordingShortcut && !globalShortcut.register(accelerator, () => this.trigger(action))) throw new Error(`Shortcut is unavailable: ${accelerator}`)
        registered.set(action, accelerator)
      }
      // Electron development binaries are not valid installed login targets.
      const startup = JSON.stringify(config.general.autoStart)
      if (this.startupApplied !== startup) {
        if (app.isPackaged && process.platform === 'win32') await applyWindowsStartup(config.general)
        else if (app.isPackaged && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: config.general.autoStart })
        this.startupApplied = startup
      }
      this.shortcuts = registered
      this.schedule(config)
    } catch (err) {
      for (const accelerator of registered.values()) globalShortcut.unregister(accelerator)
      if (!this.recordingShortcut) for (const [action, accelerator] of previous) globalShortcut.register(accelerator, () => this.trigger(action))
      throw err
    }
  }

  isShortcutRecording(): boolean { return this.recordingShortcut }

  setShortcutRecording(recording: boolean): void {
    if (this.disposed || this.recordingShortcut === recording) return
    this.recordingShortcut = recording
    if (recording) {
      for (const accelerator of this.shortcuts.values()) globalShortcut.unregister(accelerator)
    } else {
      const failed: string[] = []
      for (const [action, accelerator] of this.shortcuts) {
        if (!globalShortcut.register(accelerator, () => this.trigger(action))) failed.push(accelerator)
      }
      if (failed.length) throw new Error(`Shortcut is unavailable: ${failed.join(', ')}`)
    }
  }

  private trigger(action: string): void {
    if (this.disposed || this.recordingShortcut) return
    if (action === 'showWindow') { this.window.show(); return }
    if (this.actionPending || this.disposed) return
    this.actionPending = this.runAction(action).then(() => this.changed()).catch((err) => logger.error(`Shortcut ${action} failed`, err)).finally(() => { this.actionPending = null })
  }

  private async runAction(action: string): Promise<void> {
    const settings = this.settings.getSettings()
    if (action === 'sysProxy') return this.commands.setSystemProxy(!this.proxy.getStatus().enabled)
    if (action === 'tun') return this.commands.setTunEnabled(!settings.kernel.tun.enable)
    const mode = action === 'ruleMode' ? 'rule' : action === 'globalMode' ? 'global' : action === 'directMode' ? 'direct' : undefined
    if (mode) await this.commands.setRoutingMode(mode)
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
    this.recordingShortcut = false
    clearTimeout(this.timer)
    for (const accelerator of this.shortcuts.values()) globalShortcut.unregister(accelerator)
    this.shortcuts.clear()
    await Promise.all([this.updating, this.actionPending])
  }
}
