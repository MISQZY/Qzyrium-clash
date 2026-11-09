export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000)
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':')
}

export function formatBytes(value: number, locale: 'en' | 'ru' = 'en'): string {
  const bytes = Math.max(0, Number.isFinite(value) ? value : 0)
  const units = locale === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] : ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log2(bytes || 1) / 10), units.length - 1)
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: index === 0 ? 0 : 1, maximumFractionDigits: index === 0 ? 0 : 1 }).format(bytes / 1024 ** index)
  return `${number} ${units[index]}`
}
