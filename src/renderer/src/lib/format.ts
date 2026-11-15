export { formatBytes } from '@shared/format'

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000)
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatDurationFromStart(start: string | number): string {
  return formatDuration(Math.max(0, Date.now() - new Date(start).getTime()))
}
