import { createKernelRuntime } from './createKernelRuntime'
import { powerMonitor } from 'electron'
import { installGeoResources } from '../core/installGeoResources'
import { KernelGlobeResolver } from '../core/KernelGlobeResolver'
import type { ActiveConfigBuilder } from '../core/ActiveConfigBuilder'
import { restoreProxySelection } from '../core/ProxySelection'
import type { TrafficAccounting } from '../core/TrafficAccounting'
import { nativeMessage } from '@shared/localization'
import { IPC_CHANNELS } from '@shared/ipc'
import yaml from 'yaml'
import {
  ConnectionsSnapshot,
  MihomoRule,
  ProxyNode
} from '@shared/mihomo'
import type { GlobeLocations } from '@shared/geo'
import { CoreState, LogEntry, MihomoVersion, TrafficStats } from '@shared/types'
import type { MihomoApiClient } from '../core/MihomoApiClient'
import type { MihomoProcessManager } from '../core/MihomoProcessManager'
import { logger } from '../utils/logger'
import { getAppPaths } from '../utils/paths'
import { BaseService } from './BaseService'
import { ProfileService } from './ProfileService'
import { SettingService } from './SettingService'
import type { GeoIpService } from './GeoIpService'
import { isProcessElevated } from '../utils/elevation'
import type { ProxyGroup } from '@shared/mihomo'
import { offlineProxies } from '../utils/offline-proxies'
import { flushSystemDns } from '../utils/network-transition'
import { summarizeRules } from '@shared/rules'

export class KernelService implements BaseService {
  private ruleWarning: string | null = null

  getRuleWarning(): string | null { return this.ruleWarning }
  private processManager: MihomoProcessManager
  private apiClient: MihomoApiClient
  private settingService: SettingService
  private profileService: ProfileService
  private geoIp: GeoIpService
  private globeResolver: KernelGlobeResolver
  private lifecycle: Promise<void> = Promise.resolve()
  private desiredRunning = false
  private recoverySequence = 0
  private resumeTimer?: ReturnType<typeof setTimeout>
  private connectedBeforeSleep = false

  private onSuspend = (): void => {
    this.connectedBeforeSleep = this.desiredRunning && ['running', 'starting'].includes(this.getStatus())
    this.cancelResume()
  }

  private onResume = (): void => {
    this.cancelResume()
    const general = this.settingService.getSettings().general
    if (!general.reconnectAfterSleep || !this.connectedBeforeSleep || !this.desiredRunning) return
    this.connectedBeforeSleep = false
    const sequence = this.recoverySequence
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = undefined
      void this.enqueueLifecycle(async () => {
        const current = () => this.desiredRunning && sequence === this.recoverySequence && !!this.settingService.getSettings().general.reconnectAfterSleep
        if (!current()) return
        try {
          await this.apiClient.getVersion()
          if (current() && !this.streamsPaused && this.getStatus() === 'running') this.apiClient.startTrafficStream()
        } catch {
          if (!current()) return
          logger.info('Recovering unresponsive core after wake-up')
          await this.stopCore()
          if (current()) await this.startCore()
        }
      }).catch(error => logger.error('Connection recovery after wake-up failed', error))
    }, (general.resumeDelaySeconds ?? 5) * 1000)
    this.resumeTimer.unref()
  }

  private cancelResume(): void {
    this.recoverySequence++
    clearTimeout(this.resumeTimer)
    this.resumeTimer = undefined
  }
  private configBuilder: ActiveConfigBuilder
  private broadcaster: ((channel: string, data: unknown) => void) | null = null
  private sessionStartedAt: number | null = null
  private streamsPaused = false
  private startupRunning?: boolean
  private trafficAccounting: TrafficAccounting

  private resetDirectTraffic(): void {
    this.trafficAccounting.reset()
  }

  setStartupRunning(running: boolean): void { this.startupRunning = running }

  constructor(settingService: SettingService, profileService: ProfileService,
    runtime = createKernelRuntime(settingService.getSettings(), profileService)) {
    this.settingService = settingService
    this.profileService = profileService
    this.configBuilder = runtime.configBuilder
    this.processManager = runtime.processManager
    this.apiClient = runtime.apiClient
    this.geoIp = runtime.geoIp
    this.trafficAccounting = runtime.trafficAccounting

    this.globeResolver = new KernelGlobeResolver({
      profiles: profileService,
      geoIp: this.geoIp,
      status: () => this.getStatus(),
      settings: () => this.settingService.getSettings(),
      connections: () => this.getConnections(),
      proxies: () => this.getProxies(),
      resolveHost: host => this.apiClient.resolveHost(host)
    })
    this.setupListeners()
  }

  setBroadcaster(fn: (channel: string, data: unknown) => void): void {
    this.broadcaster = fn
  }

  private setupListeners(): void {
    this.processManager.on('state-change', (state: CoreState) => {
      if (state === 'running') this.sessionStartedAt = Date.now()
      else this.sessionStartedAt = null
      this.broadcaster?.('event:core-status', state)
      if (state === 'running' && !this.streamsPaused) {
        this.apiClient.startTrafficStream()
      } else if (state === 'stopped' || state === 'error') {
        this.apiClient.stopAllStreams()
      }
    })

    this.processManager.on('log', (entry: LogEntry) => {
      this.broadcaster?.(IPC_CHANNELS.EVENT_LOG, entry)
    })

    this.processManager.on('tun-error', (errText: string) => {
      this.broadcaster?.('event:tun-error', errText)
      if (this.settingService.getSettings().kernel.tun.enable) {
        void this.stop()
      }
    })

    this.apiClient.on('traffic', (stats: TrafficStats) => {
      this.broadcaster?.('event:traffic', stats)
    })

    // The process pipes are the single source of core logs, including startup
    // and background operation. A parallel WebSocket stream duplicates entries.
  }

  async initialize(): Promise<void> {
    powerMonitor?.on('suspend', this.onSuspend)
    powerMonitor?.on('resume', this.onResume)
    const settings = this.settingService.getSettings()
    if (this.startupRunning ?? settings.general.autoConnect) {
      await this.start()
    }
  }

  async dispose(): Promise<void> {
    powerMonitor?.removeListener('suspend', this.onSuspend)
    powerMonitor?.removeListener('resume', this.onResume)
    await this.stop()
    this.geoIp.dispose()
  }

  getStatus(): CoreState {
    return this.processManager.getState()
  }

  getSessionStartedAt(): number | null { return this.sessionStartedAt }

  async getVersion(): Promise<MihomoVersion> {
    try {
      return await this.apiClient.getVersion()
    } catch {
      return { version: 'unknown', meta: true }
    }
  }

  private enqueueLifecycle(action: () => Promise<void>): Promise<void> {
    const task = this.lifecycle.then(action)
    this.lifecycle = task.catch(() => {})
    return task
  }

  start(): Promise<void> {
    this.desiredRunning = true
    this.cancelResume()
    return this.enqueueLifecycle(() => this.startCore())
  }

  private async startCore(): Promise<void> {
    if (this.getStatus() === 'running' || this.getStatus() === 'starting') return
    this.resetDirectTraffic()
    this.invalidateGlobe()
    const paths = getAppPaths()
    const settings = this.settingService.getSettings()

    if (settings.kernel.tun.enable && !isProcessElevated()) {
      throw new Error(nativeMessage(settings.general.language, 'tunRequiresAdmin', settings.general))
    }

    // Capture the physical source before TUN can alter routing. This is bounded
    // by GeoIpService and never blocks Electron's event loop or window creation.
    const origin = this.geoIp.captureOrigin(true).catch(() => {})
    if (settings.kernel.tun.enable) await origin

    await installGeoResources(paths)

    const activeProfile = await this.configBuilder.build(settings)

    this.apiClient.reconfigure(
      '127.0.0.1',
      settings.kernel.controllerPort,
      settings.kernel.controllerSecret
    )

    await this.processManager.start(
      paths.mihomoDir,
      paths.activeConfigPath,
      settings.kernel.controllerPort,
      settings.kernel.controllerSecret
    )
    this.warnInvalidRules(activeProfile?.id)
    await restoreProxySelection(activeProfile, this.apiClient)
  }

  private warnInvalidRules(profileId?: string): void {
    this.ruleWarning = null
    if (!profileId || !this.profileService.getCustomRules(profileId).some((rule) => rule.enabled !== false && rule.validationError)) return
    const settings = this.settingService.getSettings()
    this.ruleWarning = nativeMessage(settings.general.language, 'invalidUserRulesMessage', settings.general)
    this.broadcaster?.(IPC_CHANNELS.EVENT_WARNING, this.ruleWarning)
  }

  stop(): Promise<void> {
    this.desiredRunning = false
    this.cancelResume()
    this.invalidateGlobe()
    return this.enqueueLifecycle(() => this.stopCore())
  }

  pauseStreams(): void {
    this.streamsPaused = true
    this.apiClient.stopAllStreams()
    this.globeResolver.releaseCaches()
    this.geoIp.releaseWorker()
  }

  resumeStreams(): void {
    this.streamsPaused = false
    if (this.getStatus() === 'running') {
      this.apiClient.startTrafficStream()
    }
  }

  private async stopCore(): Promise<void> {
    this.apiClient.stopAllStreams()
    if (this.getStatus() === 'running') {
      try {
        // Gracefully request Mihomo to teardown TUN adapter before process termination
        await Promise.race([
          this.apiClient.patchConfigs({ tun: { enable: false } }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
        ]).catch(() => {})

        // Gracefully close active proxy streams in Mihomo engine
        await Promise.race([
          this.apiClient.closeAllConnections(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
        ]).catch(() => {})
      } catch {
        // Fallback silently if API is unreachable
      }
    }
    await this.processManager.stop()
    this.resetDirectTraffic()
    flushSystemDns()
  }

  restart(): Promise<void> {
    this.desiredRunning = true
    this.cancelResume()
    this.invalidateGlobe()
    return this.enqueueLifecycle(async () => {
      await this.stopCore()
      await this.startCore()
    })
  }

  async reloadConfig(force = true): Promise<void> {
    if (this.getStatus() !== 'running') {
      await this.restart()
      return
    }
    this.invalidateGlobe()
    return this.enqueueLifecycle(async () => {
      try {
        const settings = this.settingService.getSettings()
        const activeProfile = await this.configBuilder.build(settings, true)

        await this.apiClient.reloadConfig(force)
        logger.info('Mihomo configuration reloaded on the fly via REST API')
        this.warnInvalidRules(activeProfile?.id)

        await restoreProxySelection(activeProfile, this.apiClient)
      } catch (err) {
        logger.warn(`Hot config reload failed, falling back to full restart: ${String(err)}`)
        await this.stopCore()
        await this.startCore()
      }
    })
  }

  // Proxied Mihomo API calls
  async getConfigs(): Promise<Record<string, unknown>> {
    return this.apiClient.getConfigs()
  }

  async patchConfigs(patch: Record<string, unknown>): Promise<void> {
    await this.apiClient.patchConfigs(patch)
    this.invalidateGlobe()
  }

  async getProxies(): Promise<Record<string, ProxyNode>> {
    if (this.getStatus() === 'running') return this.apiClient.getProxies()
    const profile = this.profileService.getActiveProfile()
    if (!profile) return {}
    const content = await this.profileService.getProfileContent(profile.id)
    if (content === null) return {}
    return offlineProxies(yaml.parse(content) as Record<string, unknown>, getAppPaths().mihomoDir, profile.selectedGroupProxies)
  }

  async selectProxy(group: string, proxy: string): Promise<void> {
    return this.enqueueLifecycle(async () => {
      const profile = this.profileService.getActiveProfile()
      if (!profile) throw new Error('No active profile')
      const proxies = await this.getProxies()
      if (!(proxies[group] as ProxyGroup | undefined)?.all?.includes(proxy)) throw new Error('Proxy is not available in this group')
      if (this.getStatus() === 'running') {
        await this.apiClient.selectProxy(group, proxy)
        if (this.settingService.getSettings().general.autoCloseConnection) await this.apiClient.closeAllConnections()
      }
      await this.profileService.setSelectedProxy(profile.id, group, proxy)
      this.invalidateGlobe()
    })
  }

  async testDelay(name: string, url?: string, timeout?: number): Promise<number> {
    const general = this.settingService.getSettings().general
    return this.apiClient.testProxyDelay(name, url ?? general.delayTestUrl, timeout ?? general.delayTestTimeout)
  }

  async getRules(scope?: 'summary'): Promise<MihomoRule[]> {
    if (this.getStatus() !== 'running') return []
    const rules = await this.apiClient.getRules()
    return scope === 'summary' ? summarizeRules(rules) : rules
  }

  async getConnections(): Promise<ConnectionsSnapshot> {
    return this.trafficAccounting.sample(await this.apiClient.getConnections())
  }

  private invalidateGlobe(): void {
    this.globeResolver.invalidate()
  }

  getGlobeLocations(): Promise<GlobeLocations> {
    return this.globeResolver.getLocations()
  }

  async closeConnection(id: string): Promise<void> {
    await this.apiClient.closeConnection(id)
  }

  async closeAllConnections(): Promise<void> {
    await this.apiClient.closeAllConnections()
  }
}
