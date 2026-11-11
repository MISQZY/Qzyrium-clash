import axios from 'axios'
import { Agent } from 'node:https'
import { isIP } from 'node:net'
import { subscriptionUserAgent, type AppConfig } from '@shared/app-config'
import { parseSubscriptionMetadata } from '../utils/subscription-metadata'
import { isAllowedSubscriptionAddress, isValidRemoteSubscriptionUrl, subscriptionHostname } from '../utils/subscription-url'
import { resolveSubscription, withinSubscriptionDeadline, type ResolveSubscription } from './SubscriptionResolver'

const REDIRECTS = new Set([301, 302, 303, 307, 308])

export class SubscriptionClient {
  constructor(private settings: () => AppConfig, private isCoreRunning: () => boolean,
    private options: { resolve?: ResolveSubscription; timeoutMs?: number } = {}) {}

  async download(url: string, userAgent?: string, updateViaProxy?: boolean) {
    if (!isValidRemoteSubscriptionUrl(url)) throw new Error('Invalid remote subscription URL scheme')
    const settings = this.settings()
    if (updateViaProxy && !this.isCoreRunning()) {
      throw new Error('Start the VPN core before downloading a subscription through proxy')
    }
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 15_000)
    let target = new URL(url)
    try {
      for (let redirects = 0; ; redirects++) {
        if (!isValidRemoteSubscriptionUrl(target.href)) throw new Error('Invalid subscription destination')
        const hostname = subscriptionHostname(target.hostname)
        const addresses = await withinSubscriptionDeadline(
          (this.options.resolve ?? resolveSubscription)(hostname, settings, !!updateViaProxy, signal), signal)
        if (!addresses.length || addresses.some(({ address, family }) =>
          isIP(address) !== family || !isAllowedSubscriptionAddress(address))) {
          throw new Error('Invalid subscription DNS destination')
        }
        const pinned = new URL(target.href)
        if (updateViaProxy) {
          const address = addresses.find(item => item.family === 4) ?? addresses[0]
          pinned.hostname = address.family === 6 ? `[${address.address}]` : address.address
        }
        const httpsAgent = target.protocol === 'https:'
          ? new Agent({ servername: isIP(hostname) ? undefined : hostname, keepAlive: false }) : undefined
        let response
        try {
          response = await axios.get<unknown>(pinned.href, {
            timeout: this.options.timeoutMs ?? 15_000, signal,
            maxContentLength: 15 * 1024 * 1024, maxBodyLength: 15 * 1024 * 1024,
            maxRedirects: 0, validateStatus: status => status >= 200 && status < 300 || REDIRECTS.has(status),
            headers: { 'User-Agent': userAgent || subscriptionUserAgent(settings.general.userAgent), Host: target.host },
            httpsAgent,
            // Return only approved answers; never perform a second DNS resolution.
            lookup: async () => [addresses],
            proxy: updateViaProxy ? { host: '127.0.0.1', port: settings.kernel.mixedPort, protocol: 'http' } : false
          })
        } finally { httpsAgent?.destroy() }
        if (!REDIRECTS.has(response.status)) {
          const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
          return { content, ...parseSubscriptionMetadata(response.headers, content) }
        }
        if (redirects >= 5 || typeof response.headers.location !== 'string') throw new Error('Invalid subscription redirect')
        const next = new URL(response.headers.location, target)
        if (target.protocol === 'https:' && next.protocol !== 'https:') throw new Error('Unsafe subscription redirect')
        target = next
      }
    } catch (error: unknown) {
      // Axios errors can carry the full URL, auth headers and request config.
      const status = (error as { response?: { status?: unknown } } | null)?.response?.status
      // eslint-disable-next-line preserve-caught-error -- The original cause may contain credentials.
      throw new Error(`Subscription download failed${typeof status === 'number' && Number.isInteger(status)
        && status >= 100 && status <= 599 ? ` (HTTP ${status})` : ''}`)
    }
  }
}
