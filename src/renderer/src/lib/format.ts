export { formatBytes } from '@shared/format'

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor(totalSeconds / 60) % 60
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function formatDurationFromStart(start: string | number): string {
  const startMs = typeof start === 'number' ? start : Date.parse(start) || 0
  return formatDuration(Math.max(0, Date.now() - startMs))
}
