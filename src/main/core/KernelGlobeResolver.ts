import fs from 'fs'
import path from 'path'
import { isIP } from 'node:net'
import { createHash } from 'node:crypto'
import yaml from 'yaml'
import type { ConnectionsSnapshot, ProxyNode } from '@shared/mihomo'
import type { GeoLocation, GlobeLocations } from '@shared/geo'
import type { AppConfig } from '@shared/app-config'
import type { GeoIpService } from '../services/GeoIpService'
import type { ProfileConfigSource } from './ActiveConfigBuilder'
import { getAppPaths } from '../utils/paths'
import { globeCandidates } from '../utils/globe-routes'
import { globeProfile, globeProxies } from '../utils/globe-profile'

export interface KernelGlobeContext {
  profiles: Pick<ProfileConfigSource, 'getActiveProfile' | 'getProfileContent'>
  geoIp: Pick<GeoIpService, 'getOrigin' | 'captureOrigin' | 'locateHost'>
  status(): string
  settings(): AppConfig
  connections(): Promise<ConnectionsSnapshot>
  proxies(): Promise<Record<string, ProxyNode>>
  resolveHost(host: string): Promise<string[]>
}

export class KernelGlobeResolver {
  private geoGeneration = 0
  private globeRequest: { key: string; value: Promise<GlobeLocations> } | null = null
  private parsedProfile: { digest: string; config: Record<string, unknown> } | null = null
  private providerCache = new Map<string, { stamp: string; proxies: unknown }>()

  constructor(private context: KernelGlobeContext) {}

  releaseCaches(): void {
    this.parsedProfile = null
    this.providerCache.clear()
  }

  invalidate(): void {
    this.geoGeneration++
    this.globeRequest = null
  }

  getLocations(): Promise<GlobeLocations> {
    const profile = this.context.profiles.getActiveProfile()
    const settings = this.context.settings()
    const generation = this.geoGeneration
    const key = JSON.stringify([generation, this.context.status(), profile?.id, profile?.updatedAt, settings.kernel.mode, settings.kernel.tun.enable])
    if (this.globeRequest?.key === key) return this.globeRequest.value
    const value = this.loadGlobeLocations(generation).then((result) => generation === this.geoGeneration ? result : { origin: this.context.geoIp.getOrigin(), routes: [] })
    const request = { key, value }
    this.globeRequest = request
    void value.finally(() => { if (this.globeRequest === request) this.globeRequest = null }).catch(() => {})
    return value
  }

  private async loadGlobeLocations(generation: number): Promise<GlobeLocations> {
    const isRunning = this.context.status() === 'running'
    if (!isRunning) return { origin: this.context.geoIp.getOrigin(), routes: [] }
    const settings = this.context.settings()
    if (settings.kernel.mode === 'direct') return { origin: this.context.geoIp.getOrigin(), routes: [], status: 'direct' }
    // Axios bypasses the system HTTP proxy. Retrying while our TUN is active could
    // mistake the VPN exit for the physical origin, so only retry on a direct stack.
    if (!this.context.geoIp.getOrigin() && !settings.kernel.tun.enable) await this.context.geoIp.captureOrigin()
    let snapshot: ConnectionsSnapshot = { downloadTotal: 0, uploadTotal: 0, connections: [] }
    let proxies: Record<string, ProxyNode> = {}
    if (isRunning) {
      try {
        ;[snapshot, proxies] = await Promise.all([this.context.connections(), this.context.proxies()])
      } catch { /* Kernel starting or restarting */ }
    }
    const hosts = new Map<string, string>()
    const profile = this.context.profiles.getActiveProfile()
    let config: Record<string, unknown> = {}
    const collect = (list: unknown) => {
      if (!Array.isArray(list)) return
      for (const proxy of list) if (proxy && typeof proxy.name === 'string' && typeof proxy.server === 'string') hosts.set(proxy.name, proxy.server)
    }
    try {
      const raw = profile ? await this.context.profiles.getProfileContent(profile.id) || '' : ''
      const digest = createHash('sha256').update(raw).digest('hex')
      if (this.parsedProfile?.digest === digest) config = this.parsedProfile.config
      else {
        const parsed = yaml.parse(raw)
        if (parsed && typeof parsed === 'object') config = globeProfile(parsed)
        this.parsedProfile = { digest, config }
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
            cached = { stamp, proxies: globeProxies(yaml.parse(await fs.promises.readFile(filename, 'utf8'))?.proxies) }
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
        const location = await this.context.geoIp.locateHost(host)
        if (location) return { node, location }
        if (!isIP(host)) {
          try {
            // A system lookup may return Mihomo's fake-IP rather than the server's IP.
            for (const address of (await this.context.resolveHost(host)).slice(0, 4)) {
              const resolved = await this.context.geoIp.locateHost(address)
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
    const origin = this.context.geoIp.getOrigin()
    const routes = resolved.filter((route) => route !== null)
    const status = !origin ? 'origin-unavailable' : routes.length ? 'ready' : [...active.values()].some((hosts) => hosts.length) ? 'geoip-unavailable' : 'server-unavailable'
    return { origin, routes, status, pendingNodes: [...active.keys()].filter((node) => !origin || !routes.some((route) => route.node === node)) }
  }

}
