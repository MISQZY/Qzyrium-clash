import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import type { Duplex } from 'node:stream'

const MAX_BYTES = 8 * 1024 * 1024
const BUNDLED_CA = [...tls.rootCertificates]
const ASSET_HOSTS = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com'])

class ReleasePolicyError extends Error {}

function trustedUrl(value: string, redirect = false): URL {
  const url = new URL(value)
  const officialApi = url.hostname === 'api.github.com' &&
    /^\/repos\/MetaCubeX\/mihomo\/releases\/(?:latest|tags\/Prerelease-Alpha)$/.test(url.pathname)
  const officialAsset = url.hostname === 'github.com' &&
    /^\/MetaCubeX\/mihomo\/releases\/download\/[^/]+\/(?:checksums\.txt|version\.txt)$/.test(url.pathname)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    (!officialApi && !officialAsset && !(redirect && ASSET_HOSTS.has(url.hostname)))) {
    throw new ReleasePolicyError('Untrusted core release metadata URL')
  }
  return url
}

/** Fetch trust metadata independently of download mirrors, environment proxies and extra CAs. */
export async function fetchCoreReleaseResource<T>(value: string, options: {
  responseType: 'json' | 'text'
  timeout: number
  proxyPort?: number
}): Promise<T> {
  const initial = trustedUrl(value)
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) throw new Error('Invalid release request timeout')
  if (options.proxyPort !== undefined && (!Number.isInteger(options.proxyPort) || options.proxyPort < 1 || options.proxyPort > 65535)) {
    throw new Error('Invalid release proxy port')
  }
  const deadline = Date.now() + options.timeout
  let remainingBytes = MAX_BYTES

  const attempt = async (proxyPort?: number): Promise<T> => {
    const controller = new AbortController()
    // Reserve time for the local core when a direct connection is blocked.
    const remaining = deadline - Date.now()
    const budget = proxyPort === undefined && options.proxyPort !== undefined ? Math.min(5000, remaining / 2) : remaining
    if (budget <= 0) throw new Error('Core release metadata request timed out')
    const timer = setTimeout(() => controller.abort(new Error('Core release metadata request timed out')), budget)
    const signal = controller.signal
    const agent = new https.Agent({ keepAlive: false, ca: BUNDLED_CA, rejectUnauthorized: true })
    if (proxyPort !== undefined) {
      agent.createConnection = (connection, callback) => {
        let settled = false
        const complete = (error: Error | null, socket?: Duplex) => {
          if (settled) { socket?.destroy(); return }
          settled = true
          callback?.(error, socket!)
        }
        const host = String(connection.servername || connection.hostname || connection.host)
        const tunnel = http.request({ hostname: '127.0.0.1', port: proxyPort, method: 'CONNECT',
          path: `${host}:443`, headers: { Host: `${host}:443` }, agent: false, signal })
        tunnel.on('error', error => complete(error))
        tunnel.once('connect', (response, socket, head) => {
          if (settled) { socket.destroy(); return }
          if (response.statusCode !== 200) {
            socket.destroy()
            complete(new Error(`Core release proxy CONNECT failed: ${response.statusCode}`))
            return
          }
          if (head.length) socket.unshift(head)
          const secured = tls.connect({ socket, servername: host, ca: BUNDLED_CA,
            rejectUnauthorized: true, checkServerIdentity: tls.checkServerIdentity })
          const abort = () => secured.destroy(new Error('Core release metadata request aborted'))
          signal.addEventListener('abort', abort, { once: true })
          secured.once('close', () => signal.removeEventListener('abort', abort))
          const failed = (error: Error) => { secured.destroy(); complete(error) }
          secured.on('error', failed)
          secured.once('secureConnect', () => {
            secured.removeListener('error', failed)
            complete(null, secured)
          })
          if (signal.aborted) abort()
        })
        tunnel.end()
        return undefined
      }
    }
    try {
      let url = initial
      for (let redirects = 0; ; redirects++) {
        signal.throwIfAborted()
        const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
          const request = https.request(url, { method: 'GET', agent, signal,
            ca: BUNDLED_CA, rejectUnauthorized: true, checkServerIdentity: tls.checkServerIdentity,
            servername: url.hostname, headers: { 'User-Agent': 'Qzyrium-clash', Accept: options.responseType === 'json' ? 'application/vnd.github+json' : 'text/plain', 'Accept-Encoding': 'identity' } }, resolve)
          request.once('error', reject)
          request.end()
        })
        const status = response.statusCode ?? 0
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy()
          if (redirects >= 5) throw new ReleasePolicyError('Too many core release redirects')
          const location = response.headers.location
          if (!location) throw new ReleasePolicyError('Missing core release redirect location')
          url = trustedUrl(new URL(location, url).href, true)
          continue
        }
        if (status !== 200) {
          response.destroy()
          throw new Error(`Core release metadata HTTP ${status}`)
        }
        const declared = Number(response.headers['content-length'])
        if (Number.isFinite(declared) && declared > remainingBytes) {
          response.destroy()
          throw new ReleasePolicyError('Core release metadata exceeds 8 MiB')
        }
        const chunks: Buffer[] = []
        for await (const chunk of response) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          remainingBytes -= buffer.length
          if (remainingBytes < 0) {
            response.destroy()
            throw new ReleasePolicyError('Core release metadata exceeds 8 MiB')
          }
          chunks.push(buffer)
        }
        const text = Buffer.concat(chunks).toString('utf8')
        return (options.responseType === 'json' ? JSON.parse(text) : text) as T
      }
    } finally {
      clearTimeout(timer)
      controller.abort()
      agent.destroy()
    }
  }

  try { return await attempt() }
  catch (error) {
    if (error instanceof ReleasePolicyError || options.proxyPort === undefined || Date.now() >= deadline) throw error
    return attempt(options.proxyPort)
  }
}
