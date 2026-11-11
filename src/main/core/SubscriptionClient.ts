import axios from 'axios'
import { subscriptionUserAgent, type AppConfig } from '@shared/app-config'
import { parseSubscriptionMetadata } from '../utils/subscription-metadata'
import { isValidRemoteSubscriptionUrl } from '../utils/subscription-url'

export class SubscriptionClient {
  constructor(private settings: () => AppConfig, private isCoreRunning: () => boolean) {}

  async download(url: string, userAgent?: string, updateViaProxy?: boolean) {
    if (!isValidRemoteSubscriptionUrl(url)) throw new Error('Invalid remote subscription URL scheme')
    const settings = this.settings()
    const options = {
      timeout: 15_000,
      maxContentLength: 15 * 1024 * 1024,
      maxBodyLength: 15 * 1024 * 1024,
      maxRedirects: 5,
      headers: { 'User-Agent': userAgent || subscriptionUserAgent(settings.general.userAgent) }
    }
    if (updateViaProxy && !this.isCoreRunning()) {
      throw new Error('Start the VPN core before downloading a subscription through proxy')
    }
    const response = await axios.get<unknown>(url, updateViaProxy ? {
      ...options, proxy: { host: '127.0.0.1', port: settings.kernel.mixedPort, protocol: 'http' }
    } : options).catch((error: unknown) => {
      // Axios errors can carry the full URL, auth headers and request config.
      const status = (error as { response?: { status?: unknown } } | null)?.response?.status
      throw new Error(`Subscription download failed${typeof status === 'number' && Number.isInteger(status)
        && status >= 100 && status <= 599 ? ` (HTTP ${status})` : ''}`)
    })
    const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
    return { content, ...parseSubscriptionMetadata(response.headers, content) }
  }
}
