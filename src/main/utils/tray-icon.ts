import { nativeImage, type NativeImage } from 'electron'
import type { VpnStatus } from '@shared/vpn-status'

const colors: Record<VpnStatus, [number, number, number]> = {
  on: [22, 101, 52],
  off: [75, 85, 99],
  starting: [146, 90, 14],
  error: [153, 27, 27]
}

/** Paint at 4x for smooth corners, then supply native 1x/2x tray images. */
export function createTrayIcon(logo: NativeImage, status: VpnStatus): NativeImage {
  const size = 64
  const radius = 16
  const inset = 8
  const logoSize = size - inset * 2
  const pixels = Buffer.alloc(size * size * 4)
  const [red, green, blue] = colors[status]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x - 0.5, x + 0.5 - (size - radius), 0)
      const dy = Math.max(radius - y - 0.5, y + 0.5 - (size - radius), 0)
      if (dx * dx + dy * dy > radius * radius) continue
      const offset = (y * size + x) * 4
      pixels[offset] = blue
      pixels[offset + 1] = green
      pixels[offset + 2] = red
      pixels[offset + 3] = 255
    }
  }
  if (!logo.isEmpty()) {
    // Electron exposes premultiplied BGRA bitmaps on Windows/Linux.
    const source = logo.resize({ width: logoSize, height: logoSize, quality: 'best' }).toBitmap()
    for (let y = 0; y < logoSize; y++) {
      for (let x = 0; x < logoSize; x++) {
        const from = (y * logoSize + x) * 4
        const to = ((y + inset) * size + x + inset) * 4
        const alpha = source[from + 3] / 255
        const gray = Math.round(source[from] * 0.0722 + source[from + 1] * 0.7152 + source[from + 2] * 0.2126)
        for (let channel = 0; channel < 3; channel++) {
          const foreground = status === 'off' ? gray : source[from + channel]
          pixels[to + channel] = Math.min(255, Math.round(foreground + pixels[to + channel] * (1 - alpha)))
        }
      }
    }
  }
  const full = nativeImage.createFromBitmap(pixels, { width: size, height: size })
  const icon = full.resize({ width: 16, height: 16, quality: 'best' })
  for (const scaleFactor of [2, 3, 4]) {
    icon.addRepresentation({ scaleFactor, buffer: full.resize({ width: 16 * scaleFactor, height: 16 * scaleFactor, quality: 'best' }).toPNG() })
  }
  return icon
}
