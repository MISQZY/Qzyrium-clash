import { net, type Session } from 'electron'

// Electron session.fetch rejects manual redirects. net.request exposes the
// redirect response so the shared requester can validate and follow each hop.
export function createElectronServiceFetch(session: Session): (url: string, init?: RequestInit) => Promise<Response> {
  return (url, init) => new Promise((resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) { reject(signal.reason); return }
    const request = net.request({ session, url, method: 'GET', redirect: 'manual', useSessionCookies: true })
    let done = false
    const finish = (response?: Response, error?: unknown) => {
      if (done) return
      done = true
      signal?.removeEventListener('abort', abort)
      if (response) resolve(response)
      else reject(error ?? new Error('Service request failed'))
    }
    const abort = () => { finish(undefined, signal?.reason); request.abort() }
    const headers = (values: Record<string, string | string[] | undefined>) => {
      const result = new Headers()
      for (const [key, value] of Object.entries(values)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) result.append(key, item)
      }
      return result
    }
    signal?.addEventListener('abort', abort, { once: true })
    new Headers(init?.headers).forEach((value, key) => request.setHeader(key, value))
    request.on('redirect', (status, _method, location, responseHeaders) => {
      const resultHeaders = headers(responseHeaders)
      resultHeaders.set('location', location)
      finish(new Response(null, { status, headers: resultHeaders }))
      request.abort()
    })
    request.on('response', response => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 8 * 1024 * 1024) { finish(undefined, new Error('Service response exceeds size limit')); request.abort(); return }
        chunks.push(chunk)
      })
      response.on('error', error => finish(undefined, error))
      response.on('aborted', () => finish(undefined, new Error('Service response interrupted')))
      response.on('end', () => {
        if (done) return
        try {
          finish(new Response([204, 205, 304].includes(response.statusCode) ? null : Buffer.concat(chunks), {
            status: response.statusCode, headers: headers(response.headers)
          }))
        } catch (error) { finish(undefined, error) }
      })
    })
    request.on('error', error => finish(undefined, error))
    request.on('abort', () => finish(undefined, new Error('Service request aborted')))
    request.end()
  })
}
