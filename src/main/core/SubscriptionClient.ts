import axios from 'axios'
import { Agent } from 'node:https'
import { isIP } from 'node:net'
import { subscriptionUserAgent, type AppConfig } from '@shared/app-config'
import { parseSubscriptionMetadata } from '../utils/subscription-metadata'
import { isAllowedSubscriptionAddress, isValidRemoteSubscriptionUrl, subscriptionHostname } from '../utils/subscription-url'
import { resolveSubscription, withinSubscriptionDeadline, type ResolveSubscription } from './SubscriptionResolver'
import { SubscriptionDownloadError, type SubscriptionFailure } from '../utils/subscription-error'
import { subscriptionDeviceHeaders } from '../utils/subscription-device'

const REDIRECTS = new Set([301, 302, 303, 307, 308])

export class SubscriptionClient {
  constructor(private settings: () => AppConfig, private isCoreRunning: () => boolean,
    private options: { resolve?: ResolveSubscription; timeoutMs?: number; proxyPort?: () => Promise<number>; deviceHeaders?: typeof subscriptionDeviceHeaders } = {}) {}

  async download(url: string, userAgent?: string, updateViaProxy?: boolean, sendHwid = false) {
    const settings = this.settings()
    const fail = (code: SubscriptionFailure) => new SubscriptionDownloadError(code, settings.general)
    if (!isValidRemoteSubscriptionUrl(url)) throw fail('url')
    if (updateViaProxy && !this.isCoreRunning()) {
      throw fail('proxy')
    }
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 15_000)
    let target = new URL(url)
    const origin = target.origin
    let phase: 'dns' | 'network' = 'dns'
    try {
      let deviceHeaders: Record<string, string> = {}
      if (sendHwid) {
        try { deviceHeaders = await (this.options.deviceHeaders ?? subscriptionDeviceHeaders)(origin) }
        catch { throw fail('identity') }
      }
      const proxyPort = updateViaProxy && this.options.proxyPort ? await this.options.proxyPort() : settings.kernel.mixedPort
      for (let redirects = 0; ; redirects++) {
        if (!isValidRemoteSubscriptionUrl(target.href)) throw fail('blocked')
        const hostname = subscriptionHostname(target.hostname)
        phase = 'dns'
        const addresses = await withinSubscriptionDeadline(
          (this.options.resolve ?? resolveSubscription)(hostname, settings, !!updateViaProxy, signal), signal)
        if (!addresses.length) throw fail('dns')
        if (addresses.some(({ address, family }) =>
          isIP(address) !== family || !isAllowedSubscriptionAddress(address))) {
          throw fail('blocked')
        }
        const pinned = new URL(target.href)
        if (updateViaProxy) {
          const address = addresses.find(item => item.family === 4) ?? addresses[0]
          pinned.hostname = address.family === 6 ? `[${address.address}]` : address.address
        }
        const httpsAgent = target.protocol === 'https:'
          ? new Agent({ servername: isIP(hostname) ? undefined : hostname, keepAlive: false }) : undefined
        let response
        phase = 'network'
        try {
          response = await axios.get<unknown>(pinned.href, {
            timeout: this.options.timeoutMs ?? 15_000, signal,
            maxContentLength: 15 * 1024 * 1024, maxBodyLength: 15 * 1024 * 1024,
            maxRedirects: 0, validateStatus: status => status >= 200 && status <= 599,
            headers: { 'User-Agent': userAgent || subscriptionUserAgent(settings.general.userAgent), Host: target.host,
              ...(target.origin === origin ? deviceHeaders : {}) },
            httpsAgent,
            // Return only approved answers; never perform a second DNS resolution.
            lookup: async () => [addresses],
            proxy: updateViaProxy ? { host: '127.0.0.1', port: proxyPort, protocol: 'http' } : false
          })
        } finally { httpsAgent?.destroy() }
        if (!REDIRECTS.has(response.status)) {
          const metadata = parseSubscriptionMetadata(response.headers, '')
          // A device-limit response may be a placeholder rather than a working configuration.
          if (metadata.deviceStatus) return { content: '', ...metadata }
          if (response.status >= 400) throw new SubscriptionDownloadError('http', settings.general, response.status)
          const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
          return { content, ...parseSubscriptionMetadata(response.headers, content) }
        }
        if (redirects >= 5 || typeof response.headers.location !== 'string') throw fail('redirect')
        let next: URL
        try { next = new URL(response.headers.location, target) } catch { throw fail('redirect') }
        if (target.protocol === 'https:' && next.protocol !== 'https:') throw fail('blocked')
        target = next
      }
    } catch (error: unknown) {
      if (error instanceof SubscriptionDownloadError) throw error
      // Axios errors can carry the full URL, auth headers and request config.
      const detail = error as { code?: string; response?: { status?: unknown }; message?: unknown } | null
      const status = detail?.response?.status
      if (signal.aborted || ['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(detail?.code ?? '')) throw fail('timeout')
      if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) {
        throw new SubscriptionDownloadError('http', settings.general, status)
      }
      const code = detail?.code ?? ''
      if (/^(?:ERR_TLS_|CERT_|ERR_SSL_)/.test(code) || ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(code)) throw fail('tls')
      // Axios does not expose a separate error code for maxContentLength.
      if (code === 'ERR_BAD_RESPONSE' && typeof detail?.message === 'string' && detail.message.startsWith('maxContentLength size of ')) throw fail('size')
      throw fail(phase === 'dns' || ['ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'dns' : 'network')
    }
  }
}
