export function formatBytes(value: number, locale: 'en' | 'ru' = 'en'): string {
  const bytes = Math.max(0, Number.isFinite(value) ? value : 0)
  const units = locale === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] : ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log2(bytes || 1) / 10), units.length - 1)
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: index === 0 ? 0 : 1,
    maximumFractionDigits: index === 0 ? 0 : 1
  }).format(bytes / 1024 ** index)
  return `${number} ${units[index]}`
}
