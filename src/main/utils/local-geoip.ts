import { Worker } from 'node:worker_threads'
import { isIP } from 'node:net'
import centers from './country-centers.json'
import type { GeoLocation } from '@shared/geo'

// Read V2Ray GeoIPList (country_code + CIDR) in a worker. Keep the existing
// 16 MB database, not a million-object index, and never scan on Electron's UI thread.
const source = String.raw`
const { parentPort, workerData } = require('node:worker_threads')
const data = require('node:fs').readFileSync(workerData)
let position = 0
function uint() {
  let value = 0, shift = 0, byte
  do { if (position >= data.length || shift > 35) throw Error('Invalid GeoIP data'); byte = data[position++]; value += (byte & 127) * 2 ** shift; shift += 7 } while (byte & 128)
  return value
}
function field() {
  const tag = uint(), wire = tag & 7
  if (wire === 0) return { number: tag >>> 3, value: uint() }
  if (wire === 2) {
    const size = uint(), start = position
    position += size
    if (position > data.length) throw Error('Invalid GeoIP field')
    return { number: tag >>> 3, start, end: position }
  }
  throw Error('Unsupported GeoIP field')
}
const countries = []
while (position < data.length) {
  const entry = field()
  if (entry.number !== 1 || entry.start === undefined) continue
  const end = entry.end
  let code = '', inverse = false
  position = entry.start
  while (position < end) {
    const part = field()
    if (part.number === 1 && part.start !== undefined) code = data.toString('utf8', part.start, part.end)
    if (part.number === 3 && part.value) inverse = true
  }
  if (/^[A-Z]{2}$/.test(code) && !inverse) countries.push({ code, start: entry.start, end })
  position = end
}
parentPort.on('message', ({ id, bytes }) => {
  try {
    for (const country of countries) {
      position = country.start
      while (position < country.end) {
        const part = field()
        if (part.number !== 2 || part.start === undefined) continue
        const end = part.end
        position = part.start
        let start = -1, size = 0, prefix = 0
        while (position < end) {
          const item = field()
          if (item.number === 1 && item.start !== undefined) { start = item.start; size = item.end - item.start }
          if (item.number === 2 && item.value !== undefined) prefix = item.value
        }
        position = end
        if (start < 0 || size !== bytes.length || prefix > size * 8) continue
        const full = Math.floor(prefix / 8), remainder = prefix % 8
        let matches = true
        for (let i = 0; i < full; i++) if (data[start + i] !== bytes[i]) { matches = false; break }
        if (matches && remainder) matches = (data[start + full] >> (8 - remainder)) === (bytes[full] >> (8 - remainder))
        if (matches) { parentPort.postMessage({ id, country: country.code }); return }
      }
    }
    parentPort.postMessage({ id, country: null })
  } catch { parentPort.postMessage({ id, country: null }) }
})
`

export class LocalGeoIp {
  private worker: Worker | null = null
  private failed = false
  private sequence = 0
  private pending = new Map<number, { resolve: (country: string | null) => void; timer: ReturnType<typeof setTimeout> }>()
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  constructor(private database: () => string | undefined) {}

  private checkIdle(): void {
    if (this.pending.size === 0 && this.worker) {
      if (this.idleTimer) clearTimeout(this.idleTimer)
      this.idleTimer = setTimeout(() => {
        this.shutdownWorker()
      }, 15000)
      this.idleTimer.unref()
    }
  }

  private shutdownWorker(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.worker && this.pending.size === 0) {
      const w = this.worker
      this.worker = null
      void w.terminate()
    }
  }

  private ensureWorker(): Worker | null {
    if (this.failed) return null
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.worker) return this.worker
    const filename = this.database()
    if (!filename) return null
    const worker = new Worker(source, { eval: true, workerData: filename })
    worker.unref()
    worker.on('message', ({ id, country }: { id: number; country: string | null }) => {
      const request = this.pending.get(id)
      if (!request) return
      clearTimeout(request.timer); this.pending.delete(id); request.resolve(country)
      this.checkIdle()
    })
    const fail = () => {
      if (this.worker !== worker) return
      this.failed = true; this.worker = null
      if (this.idleTimer) {
        clearTimeout(this.idleTimer)
        this.idleTimer = null
      }
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve(null) }
      this.pending.clear()
    }
    worker.on('error', fail)
    worker.on('exit', fail)
    this.worker = worker
    return worker
  }

  async lookup(ip: string): Promise<GeoLocation | null> {
    const family = isIP(ip)
    if (!family) return null
    let bytes: number[]
    if (family === 4) bytes = ip.split('.').map(Number)
    else {
      if (ip.includes('.')) return null
      const [left, right] = ip.split('::').map((half) => half ? half.split(':') : [])
      const words = right ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left
      bytes = words.flatMap((word) => { const value = parseInt(word, 16); return [value >> 8, value & 255] })
    }
    const worker = this.ensureWorker()
    if (!worker) return null
    const country = await new Promise<string | null>((resolve) => {
      const id = ++this.sequence
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.checkIdle()
        resolve(null)
      }, 3000)
      this.pending.set(id, { resolve, timer })
      worker.postMessage({ id, bytes })
    })
    this.checkIdle()
    const coordinate = country && (centers as Record<string, number[]>)[country]
    if (!country || !coordinate) return null
    return { ip, longitude: coordinate[0], latitude: coordinate[1], city: '', country: new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || country, countryCode: country, precision: 'country' }
  }

  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve(null) }
    this.pending.clear()
    void this.worker?.terminate()
    this.worker = null
  }
}
