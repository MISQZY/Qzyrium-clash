import landMask from '../assets/globe-land.png'
import { globeProjection } from './cobe-globe'

interface GlobeOptions {
  width: number; height: number; phi: number; theta: number; scale: number
  offset: [number, number]; baseColor: [number, number, number]; mapBrightness: number; dark: number
}

// The tiny land mask is from COBE (MIT); see assets/globe-land.LICENSE.
// Keep the same spherical camera, but draw only when it changes, without a WebGL context.
let points: Promise<Float32Array> | undefined
export function landPoints(): Promise<Float32Array> {
  return points ??= new Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = () => reject(new Error('Globe map unavailable'))
    image.onload = () => {
      const map = document.createElement('canvas')
      map.width = image.width; map.height = image.height
      const context = map.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, map.width, map.height).data
      const samples: number[] = []
      const count = 8000, goldenAngle = Math.PI * (3 - Math.sqrt(5))
      for (let i = 0; i < count; i++) {
        const y = 1 - 2 * (i + 0.5) / count
        const latitude = Math.asin(y), longitude = i * goldenAngle % (Math.PI * 2)
        const u = Math.floor(longitude / (Math.PI * 2) * map.width)
        const v = Math.min(map.height - 1, Math.floor((0.5 - latitude / Math.PI) * map.height))
        if (pixels[(v * map.width + u) * 4] < 128) continue
        const ring = Math.sqrt(1 - y * y)
        samples.push(-Math.cos(longitude) * ring, y, Math.sin(longitude) * ring)
      }
      resolve(new Float32Array(samples))
      map.width = map.height = 0
    }
    image.src = landMask
  })
}

export interface Globe { update: (patch: Partial<GlobeOptions>) => void; destroy: () => void }

export default function createGlobe(canvas: HTMLCanvasElement, initial: GlobeOptions): Globe {
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) throw new Error('Canvas unavailable')
  let options = initial, data: Float32Array | undefined, disposed = false
  const bands: number[][] = Array.from({ length: 8 }, () => [])
  const draw = () => {
    if (disposed) return
    const { width, height, phi, theta, scale, offset, baseColor, mapBrightness } = options
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const bufferWidth = Math.max(1, Math.round(width * dpr)), bufferHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    const radius = height * 0.4 * scale
    const cx = width / 2 + offset[0] * scale / 2, cy = height / 2 + offset[1] * scale / 2
    const color = baseColor.map(value => Math.round(value * 255)).join(',')
    // The CSS surface supplies neutral shading. Keep the oceans transparent;
    // adding a colored disk here doubles the atmosphere and lights up the center.
    if (!data) return
    const project = globeProjection({ phi, theta, scale }, { cx, cy, radius })
    const dot = Math.max(0.65, radius / 160)
    // Single-pass projection: project each point once and bucket into depth bands
    for (let b = 0; b < 8; b++) bands[b].length = 0
    for (let i = 0; i < data.length; i += 3) {
      const point = project([data[i], data[i + 1], data[i + 2]])
      if (point.depth < 0) continue
      const band = Math.min(7, Math.floor(point.depth * 8))
      bands[band].push(point.x, point.y)
    }

    for (let band = 0; band < 8; band++) {
      const coords = bands[band]
      if (coords.length === 0) continue
      context.beginPath()
      context.fillStyle = `rgba(${color},${Math.min(1, (0.22 + band / 10) * mapBrightness / 1.8)})`
      for (let j = 0; j < coords.length; j += 2) {
        const px = coords[j], py = coords[j + 1]
        context.moveTo(px + dot, py)
        context.arc(px, py, dot, 0, Math.PI * 2)
      }
      context.fill()
    }
  }
  void landPoints().then(value => { if (!disposed) { data = value; draw() } }).catch(() => {})
  return {
    update(patch) { options = { ...options, ...patch }; draw() },
    destroy() { disposed = true; data = undefined; canvas.width = canvas.height = 0 }
  }
}
