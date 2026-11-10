import axios from 'axios'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { networkInterfaces } from 'node:os'
import type { GeoLocation } from '@shared/geo'
import type { LocalGeoIp } from '../utils/local-geoip'

export function publicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)))
  }
  // Only globally routable IPv6 unicast; mapped IPv4/private/link-local are excluded.
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip)
}

export class GeoIpService {
  constructor(private local?: LocalGeoIp) {}
  private cache = new Map<string, { expires: number; value: Promise<GeoLocation | null> }>()
  private hosts = new Map<string, { expires: number; value: Promise<string | null> }>()
  private origin: GeoLocation | null = null
  private originNetwork = ''
  private originExpires = 0
  private originRequest: Promise<void> | null = null
  private disposed = false

  getOrigin(): GeoLocation | null { return this.origin }

  async captureOrigin(force = false): Promise<void> {
    if (this.disposed) return
    if (this.originRequest) return this.originRequest
    const network = JSON.stringify(Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
      (addresses ?? []).filter((address) => !address.internal && !/mihomo|tun|clash/i.test(name)).map((address) => address.address)).sort())
    if (!force && network === this.originNetwork && Date.now() < this.originExpires) return
    const sameNetwork = network === this.originNetwork
    this.originNetwork = network
    if (!sameNetwork) this.origin = null
    this.cache.delete('')
    const signal = AbortSignal.timeout(2500)
    let fallback: GeoLocation | null = null
    // The bundled database contains country centers, not city coordinates.
    // Resolve the direct public IP's city online; prepare a local fallback in
    // parallel so an unavailable provider cannot hold up TUN startup.
    const localOrigin = this.local
      ? this.discoverOrigin(signal).then((location) => { fallback = location; return location }).catch(() => null)
      : Promise.resolve(null)
    let onAbort: () => void
    const deadline = new Promise<GeoLocation | null>((resolve) => {
      onAbort = () => resolve(fallback)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    this.originRequest = Promise.race([this.locateIp('', signal).then((location) => location ?? localOrigin), deadline]).then((location) => {
      if (this.disposed) return
      if (location) this.origin = location
      this.originExpires = Date.now() + (location ? 300_000 : 60_000)
    }).finally(() => signal.removeEventListener('abort', onAbort))
    try { await this.originRequest } finally { this.originRequest = null }
  }

  private async discoverOrigin(signal: AbortSignal): Promise<GeoLocation | null> {
    for (const url of ['https://api.ipify.org?format=json', 'https://checkip.amazonaws.com/']) {
      try {
        const { data } = await axios.get(url, { proxy: false, timeout: 1400, signal, maxRedirects: 0, maxContentLength: 1024 })
        const ip = typeof data === 'string' ? data.trim() : data?.ip
        if (typeof ip === 'string' && publicIp(ip)) return this.locateIp(ip, signal)
      } catch { /* The second endpoint is independent of the first provider. */ }
    }
    return null
  }

  dispose(): void { this.disposed = true; this.cache.clear(); this.hosts.clear(); this.local?.dispose() }

  async locateHost(host: string): Promise<GeoLocation | null> {
    if (this.disposed || !host || host.length > 253) return null
    try {
      const ip = isIP(host) ? host : await this.resolveHost(host)
      return ip && publicIp(ip) ? this.locateIp(ip) : null
    } catch { return null }
  }

  private resolveHost(host: string): Promise<string | null> {
    const cached = this.hosts.get(host)
    if (cached && cached.expires > Date.now()) return cached.value
    let timer: ReturnType<typeof setTimeout>
    const entry = { expires: Date.now() + 60_000, value: Promise.resolve<string | null>(null) }
    entry.value = Promise.race([
      lookup(host).then((result) => result.address),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 2500); timer.unref() })
    ]).catch(() => null).then((address) => {
      if (!address) entry.expires = Date.now() + 10_000
      return address
    }).finally(() => clearTimeout(timer))
    this.hosts.set(host, entry)
    if (this.hosts.size > 512) this.hosts.delete(this.hosts.keys().next().value!)
    return entry.value
  }

  private locateIp(ip: string, requestSignal?: AbortSignal): Promise<GeoLocation | null> {
    if (this.disposed) return Promise.resolve(null)
    const cached = this.cache.get(ip)
    if (cached && cached.expires > Date.now()) return cached.value
    const entry = { expires: Date.now() + 86_400_000, value: Promise.resolve<GeoLocation | null>(null) }
    entry.value = (async () => {
      if (ip && this.local) {
        const location = await this.local.lookup(ip)
        if (this.disposed) return null
        if (location) return location
      }
      const encoded = encodeURIComponent(ip)
      const providers = [`https://ipwho.is/${encoded}`, `https://ipapi.co/${ip ? `${encoded}/` : ''}json/`]
      const signal = requestSignal ?? AbortSignal.timeout(3500)
      for (const url of providers) {
        try {
          const { data } = await axios.get(url, { proxy: false, timeout: 2500, signal, maxRedirects: 0, maxContentLength: 32_768 })
          if (!data || data.success === false || data.error || typeof data.ip !== 'string' || !publicIp(data.ip) || !Number.isFinite(data.longitude) || !Number.isFinite(data.latitude) || Math.abs(data.longitude) > 180 || Math.abs(data.latitude) > 90) continue
          const countryCode = typeof data.country_code === 'string' ? data.country_code : typeof data.countryCode === 'string' ? data.countryCode : undefined
          return { ip: data.ip, longitude: data.longitude, latitude: data.latitude, city: typeof data.city === 'string' ? data.city : '', country: typeof data.country_name === 'string' ? data.country_name : typeof data.country === 'string' ? data.country : '', countryCode, precision: data.city ? 'city' : 'country' }
        } catch { /* Try a second provider within the same total time budget. */ }
      }
      entry.expires = Date.now() + 60_000
      return null
    })()
    this.cache.set(ip, entry)
    if (this.cache.size > 512) this.cache.delete(this.cache.keys().next().value!)
    return entry.value
  }
}
