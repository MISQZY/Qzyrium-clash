import type { ServiceRequest } from './service-response'

/** Fetch is bound to a private Electron session whose proxy is the checked host. */
export function createServiceRequest(fetch: (url: string, init?: RequestInit) => Promise<Response>, signal: AbortSignal): ServiceRequest {
  return async (url, followRedirects = true) => {
    const timeout = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
    for (let redirects = 0; redirects <= 5; redirects++) {
      timeout.throwIfAborted()
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Unsafe service redirect')
      const response = await fetch(url, {
        method: 'GET', redirect: 'manual', signal: timeout, credentials: 'include',
        headers: { 'Accept-Language': 'en-US,en;q=0.9', 'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8' }
      })
      const location = response.headers.get('location')
      if (followRedirects && [301, 302, 303, 307, 308].includes(response.status) && location) {
        await response.body?.cancel()
        url = new URL(location, url).href
        continue
      }
      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            size += value.length
            if (size > 8 * 1024 * 1024) throw new Error('Service response exceeds size limit')
            chunks.push(value)
          }
        } finally { await reader.cancel().catch(() => {}) }
      }
      return { status: response.status, url, body: Buffer.concat(chunks).toString('utf8') }
    }
    throw new Error('Too many service redirects')
  }
}
