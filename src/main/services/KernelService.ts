import { nativeMessage } from '@shared/localization'
import { IPC_CHANNELS } from '@shared/ipc'
import fs from 'fs'
import path from 'path'
import { isIP } from 'node:net'
import yaml from 'yaml'
import {
  ConnectionsSnapshot,
  MihomoRule,
  ProxyNode
} from '@shared/mihomo'
import type { GeoLocation, GlobeLocations } from '@shared/geo'
import { CoreState, LogEntry, MihomoVersion, TrafficStats } from '@shared/types'
import { MihomoApiClient } from '../core/MihomoApiClient'
import { MihomoConfigFactory } from '../core/MihomoConfigFactory'
import { MihomoProcessManager } from '../core/MihomoProcessManager'
import { logger } from '../utils/logger'
import { getAppPaths } from '../utils/paths'
import { BaseService } from './BaseService'
import { ProfileService } from './ProfileService'
import { SettingService } from './SettingService'
import { GeoIpService } from './GeoIpService'
import { LocalGeoIp } from '../utils/local-geoip'
import { globeCandidates } from '../utils/globe-routes'
import { globeProfile, globeProxies } from '../utils/globe-profile'
import { isProcessElevated } from '../utils/elevation'
import type { ProxyGroup } from '@shared/mihomo'
import { offlineProxies } from '../utils/offline-proxies'

export class KernelService implements BaseService {
  private processManager: MihomoProcessManager
  private apiClient: MihomoApiClient
  private settingService: SettingService
  private profileService: ProfileService
  private geoIp: GeoIpService
  private geoGeneration = 0
  private globeRequest: { key: string; value: Promise<GlobeLocations> } | null = null
  private parsedProfile: { raw: string; config: Record<string, unknown> } | null = null
  private providerCache = new Map<string, { stamp: string; proxies: unknown }>()
  private lifecycle: Promise<void> = Promise.resolve()
  private synthesizedConfig: { raw: string | null; key: string; yaml: string } | null = null
  private broadcaster: ((channel: string, data: unknown) => void) | null = null
  private sessionStartedAt: number | null = null

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
    this.geoIp = new GeoIpService(
      new LocalGeoIp(() => {
        try {
          return path.resolve(getAppPaths().geoFilesDir, 'geoip.dat')
        } catch {
          return undefined
        }
      })
    )

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
      if (state === 'running') {
        this.apiClient.startTrafficStream()
        this.apiClient.startLogStream(this.settingService.getSettings().kernel.logLevel)
      } else if (state === 'stopped' || state === 'error') {
        this.apiClient.stopAllStreams()
      }
    })

    this.processManager.on('log', (entry: LogEntry) => {
      this.broadcaster?.(IPC_CHANNELS.EVENT_LOG, entry)
    })

    this.processManager.on('tun-error', (errText: string) => {
      logger.error(`TUN initialization error detected: ${errText}`)
      this.broadcaster?.('event:tun-error', errText)
      if (this.settingService.getSettings().kernel.tun.enable) {
        void this.stop()
      }
    })

    this.apiClient.on('traffic', (stats: TrafficStats) => {
      this.broadcaster?.('event:traffic', stats)
    })

    this.apiClient.on('log', (entry: LogEntry) => {
      this.broadcaster?.(IPC_CHANNELS.EVENT_LOG, entry)
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
    return this.enqueueLifecycle(() => this.startCore())
  }

  private async startCore(): Promise<void> {
    if (this.getStatus() === 'running' || this.getStatus() === 'starting') return
    this.invalidateGlobe()
    const paths = getAppPaths()
    const settings = this.settingService.getSettings()

    if (settings.kernel.tun.enable && !isProcessElevated()) {
      throw new Error(nativeMessage(settings.general.language, 'tunRequiresAdmin'))
    }

    // Capture the physical source before TUN can alter routing. This is bounded
    // by GeoIpService and never blocks Electron's event loop or window creation.
    const origin = this.geoIp.captureOrigin().catch(() => {})
    if (settings.kernel.tun.enable) await origin

    // Ensure geo database files are present in mihomoDir and up to date with bundled assets
    const geoFiles = ['country.mmdb', 'geosite.dat', 'geoip.dat']
    await Promise.all(geoFiles.map(async (file) => {
      const src = path.join(paths.geoFilesDir, file)
      const dst = path.join(paths.mihomoDir, file)
      try {
        if (fs.existsSync(src)) {
          let shouldCopy = !fs.existsSync(dst)
          if (!shouldCopy) {
            const srcStat = await fs.promises.stat(src)
            const dstStat = await fs.promises.stat(dst)
            if (srcStat.mtimeMs > dstStat.mtimeMs && srcStat.size !== dstStat.size) {
              shouldCopy = true
            }
          }
          if (shouldCopy) {
            await fs.promises.copyFile(src, dst)
            logger.info(`Updated geo resource ${file} in ${dst}`)
          }
        }
      } catch {
        // Existing resources and absent optional databases need no copy.
      }
    }))

    // Get active profile content
    const activeProfile = this.profileService.getActiveProfile()
    const rawContent = activeProfile ? await this.profileService.getProfileContent(activeProfile.id) : null

    // Synthesize configuration
    if (activeProfile && rawContent === null) throw new Error(`Profile file is missing: ${activeProfile.name}`)
    const customRules = activeProfile ? this.profileService.getCustomRules(activeProfile.id) : []
    const configKey = JSON.stringify([settings.kernel, customRules])
    if (!this.synthesizedConfig || this.synthesizedConfig.raw !== rawContent || this.synthesizedConfig.key !== configKey) {
      this.synthesizedConfig = { raw: rawContent, key: configKey, yaml: MihomoConfigFactory.synthesize(rawContent, settings, customRules) }
    }
    const yamlConfig = this.synthesizedConfig.yaml
    await fs.promises.writeFile(paths.activeConfigPath, yamlConfig, 'utf-8')

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

  stop(): Promise<void> {
    if (activeProfile?.selectedGroupProxies && Object.keys(activeProfile.selectedGroupProxies).length) {
      const proxies = await this.apiClient.getProxies()
      for (const [group, node] of Object.entries(activeProfile.selectedGroupProxies)) {
        if (!(proxies[group] as ProxyGroup | undefined)?.all?.includes(node)) continue
        try { await this.apiClient.selectProxy(group, node) }
        catch (error) { logger.warn(`Could not restore selected proxy for ${group}: ${String(error)}`) }
      }
    }
    this.invalidateGlobe()
    return this.enqueueLifecycle(() => this.stopCore())
  }

  pauseStreams(): void {
    this.apiClient.stopAllStreams()
  }

  resumeStreams(): void {
    if (this.getStatus() === 'running') {
      this.apiClient.startTrafficStream()
      this.apiClient.startLogStream(this.settingService.getSettings().kernel.logLevel)
    }
  }

  private async stopCore(): Promise<void> {
    this.apiClient.stopAllStreams()
    await this.processManager.stop()
  }

  restart(): Promise<void> {
    this.invalidateGlobe()
    return this.enqueueLifecycle(async () => {
      await this.stopCore()
      await this.startCore()
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

  async getRules(): Promise<MihomoRule[]> {
    return this.apiClient.getRules()
  }

  async getConnections(): Promise<ConnectionsSnapshot> {
    return this.apiClient.getConnections()
  }

    if (this.getStatus() !== 'running') return []
  private invalidateGlobe(): void {
    this.geoGeneration++
    this.globeRequest = null
  }

  getGlobeLocations(): Promise<GlobeLocations> {
    const profile = this.profileService.getActiveProfile()
    const settings = this.settingService.getSettings()
    const generation = this.geoGeneration
    const key = JSON.stringify([generation, this.getStatus(), profile?.id, profile?.updatedAt, settings.kernel.mode, settings.kernel.tun.enable])
    if (this.globeRequest?.key === key) return this.globeRequest.value
    const value = this.loadGlobeLocations(generation).then((result) => generation === this.geoGeneration ? result : { origin: this.geoIp.getOrigin(), routes: [] })
    const request = { key, value }
    this.globeRequest = request
    void value.finally(() => { if (this.globeRequest === request) this.globeRequest = null }).catch(() => {})
    return value
  }

  private async loadGlobeLocations(generation: number): Promise<GlobeLocations> {
    const isRunning = this.getStatus() === 'running'
    const settings = this.settingService.getSettings()
    if (settings.kernel.mode === 'direct') return { origin: this.geoIp.getOrigin(), routes: [], status: 'direct' }
    // Axios bypasses the system HTTP proxy. Retrying while our TUN is active could
    // mistake the VPN exit for the physical origin, so only retry on a direct stack.
    if (!this.geoIp.getOrigin() && !settings.kernel.tun.enable) await this.geoIp.captureOrigin()
    let snapshot: ConnectionsSnapshot = { downloadTotal: 0, uploadTotal: 0, connections: [] }
    let proxies: Record<string, ProxyNode> = {}
    if (isRunning) {
      try {
        ;[snapshot, proxies] = await Promise.all([this.getConnections(), this.getProxies()])
      } catch { /* Kernel starting or restarting */ }
    }
    const hosts = new Map<string, string>()
    const profile = this.profileService.getActiveProfile()
    let config: Record<string, unknown> = {}
    const collect = (list: unknown) => {
      if (!Array.isArray(list)) return
      for (const proxy of list) if (proxy && typeof proxy.name === 'string' && typeof proxy.server === 'string') hosts.set(proxy.name, proxy.server)
    }
    try {
      const raw = profile ? await this.profileService.getProfileContent(profile.id) || '' : ''
      if (this.parsedProfile?.raw === raw) config = this.parsedProfile.config
      else {
        const parsed = yaml.parse(raw)
        if (parsed && typeof parsed === 'object') config = parsed
        this.parsedProfile = { raw, config }
        this.providerCache = new Map()
      }
      collect(config.proxies)
      const providers = config['proxy-providers']
      if (providers && typeof providers === 'object') for (const provider of Object.values(providers).slice(0, 32)) {
        if (!provider || typeof provider !== 'object') continue
        collect(provider.payload)
        if (typeof provider.path !== 'string') continue
        const root = getAppPaths().mihomoDir
        const filename = path.resolve(root, provider.path)
        const relative = path.relative(root, filename)
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue
        try {
          const stat = await fs.promises.stat(filename)
          if (stat.size > 8_000_000) continue
          const stamp = `${stat.mtimeMs}:${stat.size}`
          let cached = this.providerCache.get(filename)
          if (!cached || cached.stamp !== stamp) {
            cached = { stamp, proxies: yaml.parse(await fs.promises.readFile(filename, 'utf8'))?.proxies }
            this.providerCache.set(filename, cached)
          }
          collect(cached.proxies)
        } catch { /* A provider may not have downloaded its cache yet. */ }
      }
    } catch { /* Live connection metadata can still supply the server address. */ }
    const active = globeCandidates(snapshot, proxies, config, hosts, settings.kernel.mode)
    const entries = [...active]
    const resolved: ({ node: string; location: GeoLocation } | null)[] = Array(entries.length).fill(null)
    let next = 0
    const resolveNode = async ([node, candidates]: [string, string[]]) => {
      for (const host of candidates) {
        if (generation !== this.geoGeneration) return null
        const location = await this.geoIp.locateHost(host)
        if (location) return { node, location }
        if (!isIP(host)) {
          try {
            // A system lookup may return Mihomo's fake-IP rather than the server's IP.
            for (const address of (await this.apiClient.resolveHost(host)).slice(0, 4)) {
              const resolved = await this.geoIp.locateHost(address)
              if (resolved) return { node, location: resolved }
            }
          } catch { /* Other candidates can still contain the actual socket IP. */ }
        }
      }
      return null
    }
    await Promise.all(Array.from({ length: Math.min(3, entries.length) }, async () => {
      while (next < entries.length && generation === this.geoGeneration) {
        const index = next++
        resolved[index] = await resolveNode(entries[index])
      }
    }))
    const origin = this.geoIp.getOrigin()
    const routes = resolved.filter((route) => route !== null)
    const status = !origin ? 'origin-unavailable' : routes.length ? 'ready' : [...active.values()].some((hosts) => hosts.length) ? 'geoip-unavailable' : 'server-unavailable'
    return { origin, routes, status, pendingNodes: [...active.keys()].filter((node) => !origin || !routes.some((route) => route.node === node)) }
  }

  async closeConnection(id: string): Promise<void> {
    await this.apiClient.closeConnection(id)
  }

  async closeAllConnections(): Promise<void> {
    await this.apiClient.closeAllConnections()
  }
}
