export type Rgb = [number, number, number]

export function contrastRatio(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => rgb.reduce((sum, value, index) => {
    const channel = value / 255
    return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]
  }, 0)
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Move toward black or white only as far as needed, retaining the theme's hue. */
export function ensureContrast(color: Rgb, backgrounds: Rgb[], minimum = 4.5): Rgb {
  const score = (candidate: Rgb) => Math.min(...backgrounds.map(bg => contrastRatio(candidate, bg)))
  if (score(color) >= minimum) return color
  let best = color, bestScore = score(color)
  for (let step = 1; step <= 100; step++) {
    for (const target of [0, 255]) {
      const candidate = color.map(value => Math.round(value + (target - value) * step / 100)) as Rgb
      const ratio = score(candidate)
      if (ratio >= minimum) return candidate
      if (ratio > bestScore) { best = candidate; bestScore = ratio }
    }
  }
  return best
}

/** Resolve through Chromium so imported themes can use any supported CSS color syntax. */
export function applyReadableThemeColors(): void {
  const root = document.documentElement
  const probe = document.createElement('span')
  probe.style.display = 'none'
  root.append(probe)
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!context) { probe.remove(); return }
  const read = (key: string): Rgb => {
    probe.style.color = `var(${key})`
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = getComputedStyle(probe).color
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3) as Rgb
  }
  const correct = (key: string, backgrounds: string[], minimum = 4.5) => {
    const color = read(key)
    const corrected = ensureContrast(color, backgrounds.map(read), minimum)
    if (corrected.some((value, index) => value !== color[index])) {
      root.style.setProperty(key, `rgb(${corrected.join(' ')})`)
    }
  }
  try {
    correct('--foreground', ['--background', '--card', '--muted', '--secondary'])
    correct('--card-foreground', ['--card'])
    correct('--popover-foreground', ['--popover'])
    correct('--secondary-foreground', ['--secondary'])
    correct('--accent-foreground', ['--accent'])
    correct('--sidebar-foreground', ['--sidebar'])
    correct('--sidebar-accent-foreground', ['--sidebar-accent'])
    correct('--muted-foreground', ['--background', '--card', '--muted', '--sidebar', '--popover'])
    // These colors also carry small text on subtly tinted badges and buttons.
    for (const key of ['--primary', '--success', '--warning', '--destructive']) {
      correct(key, ['--background', '--card', '--popover'], 6)
    }
    correct('--sidebar-primary', ['--sidebar'], 6)
    correct('--primary-foreground', ['--primary'])
    correct('--sidebar-primary-foreground', ['--sidebar-primary'])
    correct('--destructive-foreground', ['--destructive'])
  } finally { probe.remove() }
}
