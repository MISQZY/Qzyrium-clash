import axios from 'axios'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { AppConfig } from '@shared/app-config'

export interface SubscriptionAddress { address: string; family: 4 | 6 }
export type ResolveSubscription = (hostname: string, settings: AppConfig, viaProxy: boolean,
  signal: AbortSignal) => Promise<SubscriptionAddress[]>

/** DNS lookups cannot be cancelled; discard late results without delaying the caller. */
export function withinSubscriptionDeadline<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Subscription request timed out'))
    signal.addEventListener('abort', abort, { once: true })
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value) },
      error => { signal.removeEventListener('abort', abort); reject(error) })
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort() }
  })
}

export const resolveSubscription: ResolveSubscription = async (hostname, settings, viaProxy, signal) => {
  const family = isIP(hostname)
  if (family === 4 || family === 6) return [{ address: hostname, family }]
  if (!viaProxy) return await withinSubscriptionDeadline(lookup(hostname, { all: true }), signal) as SubscriptionAddress[]
  // Keep proxy-mode DNS inside the configured core instead of leaking a system lookup.
  const answers = await Promise.all(['A', 'AAAA'].map(async type => {
    const { data } = await axios.get<{ Status?: number; Answer?: { type: number; data: string }[] }>(
      `http://127.0.0.1:${settings.kernel.controllerPort}/dns/query`, {
        params: { name: hostname, type }, proxy: false, maxRedirects: 0, timeout: 15_000, signal,
        maxContentLength: 64 * 1024,
        headers: { Authorization: settings.kernel.controllerSecret ? `Bearer ${settings.kernel.controllerSecret}` : undefined }
      })
    if (data.Status && data.Status !== 0) throw new Error('Subscription DNS lookup failed')
    return (data.Answer ?? []).filter(answer => answer.type === 1 || answer.type === 28).map(answer => {
      const family = isIP(answer.data)
      if (!family || family !== (answer.type === 1 ? 4 : 6)) throw new Error('Invalid subscription DNS answer')
      return { address: answer.data, family } as SubscriptionAddress
    })
  }))
  return answers.flat()
}
