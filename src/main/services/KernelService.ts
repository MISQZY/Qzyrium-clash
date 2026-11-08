import fs from 'fs'
import path from 'path'
import {
  ConnectionsSnapshot,
  MihomoRule,
  ProxyNode
} from '@shared/mihomo'
import { CoreState, LogEntry, MihomoVersion, TrafficStats } from '@shared/types'
import { MihomoApiClient } from '../core/MihomoApiClient'
import { MihomoConfigFactory } from '../core/MihomoConfigFactory'
import { MihomoProcessManager } from '../core/MihomoProcessManager'
import { logger } from '../utils/logger'
import { getAppPaths } from '../utils/paths'
import { BaseService } from './BaseService'
import { ProfileService } from './ProfileService'
import { SettingService } from './SettingService'

export class KernelService implements BaseService {
  private processManager: MihomoProcessManager
  private apiClient: MihomoApiClient
  private settingService: SettingService
  private profileService: ProfileService
  private broadcaster: ((channel: string, data: unknown) => void) | null = null

  constructor(settingService: SettingService, profileService: ProfileService) {
    this.settingService = settingService
    this.profileService = profileService
    this.processManager = new MihomoProcessManager()

    const settings = this.settingService.getSettings()
    this.apiClient = new MihomoApiClient(
      '127.0.0.1',
      settings.kernel.controllerPort,
      settings.kernel.controllerSecret
    )

    this.setupListeners()
  }

  setBroadcaster(fn: (channel: string, data: unknown) => void): void {
    this.broadcaster = fn
  }

  private setupListeners(): void {
    this.processManager.on('state-change', (state: CoreState) => {
      this.broadcaster?.('event:core-status', state)
      if (state === 'running') {
        this.apiClient.startTrafficStream()
        this.apiClient.startLogStream(this.settingService.getSettings().kernel.logLevel)
      } else if (state === 'stopped' || state === 'error') {
        this.apiClient.stopAllStreams()
      }
    })

    this.processManager.on('log', (entry: LogEntry) => {
      this.broadcaster?.('event:core-log', entry)
    })

    this.apiClient.on('traffic', (stats: TrafficStats) => {
      this.broadcaster?.('event:traffic', stats)
    })

    this.apiClient.on('log', (entry: LogEntry) => {
      this.broadcaster?.('event:core-log', entry)
    })
  }

  async initialize(): Promise<void> {
    const settings = this.settingService.getSettings()
    if (settings.general.autoConnect) {
      await this.start()
    }
  }

  async dispose(): Promise<void> {
    await this.stop()
  }

  getStatus(): CoreState {
    return this.processManager.getState()
  }

  async getVersion(): Promise<MihomoVersion> {
    try {
      return await this.apiClient.getVersion()
    } catch {
      return { version: 'unknown', meta: true }
    }
  }

  async start(): Promise<void> {
    const paths = getAppPaths()
    const settings = this.settingService.getSettings()

    // Ensure geo database files are present in mihomoDir
    const geoFiles = ['country.mmdb', 'geosite.dat', 'geoip.dat']
    for (const file of geoFiles) {
      const src = path.join(paths.geoFilesDir, file)
      const dst = path.join(paths.mihomoDir, file)
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        try {
          fs.copyFileSync(src, dst)
          logger.info(`Copied geo resource ${file} to ${dst}`)
        } catch {
          // ignore
        }
      }
    }

    // Get active profile content
    const activeProfile = this.profileService.getActiveProfile()
    const rawContent = activeProfile ? this.profileService.getProfileContent(activeProfile.id) : null

    // Synthesize configuration
    const yamlConfig = MihomoConfigFactory.synthesize(rawContent, settings)
    fs.writeFileSync(paths.activeConfigPath, yamlConfig, 'utf-8')

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
  }

  async stop(): Promise<void> {
    this.apiClient.stopAllStreams()
    await this.processManager.stop()
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  // Proxied Mihomo API calls
  async getConfigs(): Promise<Record<string, unknown>> {
    return this.apiClient.getConfigs()
  }

  async patchConfigs(patch: Record<string, unknown>): Promise<void> {
    await this.apiClient.patchConfigs(patch)
  }

  async getProxies(): Promise<Record<string, ProxyNode>> {
    return this.apiClient.getProxies()
  }

  async selectProxy(group: string, proxy: string): Promise<void> {
    await this.apiClient.selectProxy(group, proxy)
  }

  async testDelay(name: string, url?: string, timeout?: number): Promise<number> {
    return this.apiClient.testProxyDelay(name, url, timeout)
  }

  async getRules(): Promise<MihomoRule[]> {
    return this.apiClient.getRules()
  }

  async getConnections(): Promise<ConnectionsSnapshot> {
    return this.apiClient.getConnections()
  }

  async closeConnection(id: string): Promise<void> {
    await this.apiClient.closeConnection(id)
  }

  async closeAllConnections(): Promise<void> {
    await this.apiClient.closeAllConnections()
  }
}
