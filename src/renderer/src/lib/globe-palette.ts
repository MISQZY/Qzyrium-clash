let cachedCanvas: HTMLCanvasElement | null = null
let cachedCtx: CanvasRenderingContext2D | null = null
const colorCache = new Map<string, [number, number, number]>()

export function readGlobeColor(cssVar: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof document === 'undefined') return fallback
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
    if (!val) return fallback
    const cacheKey = `${cssVar}:${val}`
    const hit = colorCache.get(cacheKey)
    if (hit) return hit

    const directMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(val)
    if (directMatch) {
      const res: [number, number, number] = [
        Number((parseInt(directMatch[1], 10) / 255).toFixed(3)),
        Number((parseInt(directMatch[2], 10) / 255).toFixed(3)),
        Number((parseInt(directMatch[3], 10) / 255).toFixed(3))
      ]
      colorCache.set(cacheKey, res)
      return res
    }

    const probe = document.createElement('span')
    probe.style.color = `var(${cssVar})`
    probe.style.display = 'none'
    document.documentElement.append(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(resolved)
    if (match) {
      const res: [number, number, number] = [
        Number((parseInt(match[1], 10) / 255).toFixed(3)),
        Number((parseInt(match[2], 10) / 255).toFixed(3)),
        Number((parseInt(match[3], 10) / 255).toFixed(3))
      ]
      colorCache.set(cacheKey, res)
      return res
    }
    if (!cachedCanvas) {
      cachedCanvas = document.createElement('canvas')
      cachedCanvas.width = 1
      cachedCanvas.height = 1
      cachedCtx = cachedCanvas.getContext('2d', { willReadFrequently: true })
    }
    if (!cachedCtx) return fallback
    cachedCtx.clearRect(0, 0, 1, 1)
    cachedCtx.fillStyle = '#000000'
    cachedCtx.fillStyle = resolved
    cachedCtx.fillRect(0, 0, 1, 1)
    const data = cachedCtx.getImageData(0, 0, 1, 1).data
    const res: [number, number, number] = [
      Number((data[0] / 255).toFixed(3)),
      Number((data[1] / 255).toFixed(3)),
      Number((data[2] / 255).toFixed(3))
    ]
    colorCache.set(cacheKey, res)
    return res
  } catch {
    return fallback
  }
}

export const DORMANT_COLOR_DARK: [number, number, number] = [0.72, 0.74, 0.78]
export const DORMANT_COLOR_LIGHT: [number, number, number] = [0.30, 0.34, 0.37]
export function measureGlobeLabel(text: string, family: string): number {
  if (!cachedCtx) return text.length * 9
  cachedCtx.font = `700 10px ${family}`
  return cachedCtx.measureText(text).width + text.length * 0.2
}
