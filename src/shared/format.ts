const formatters: Record<string, Intl.NumberFormat> = {
  'en-0': new Intl.NumberFormat('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  'en-1': new Intl.NumberFormat('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  'ru-0': new Intl.NumberFormat('ru', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  'ru-1': new Intl.NumberFormat('ru', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function formatBytes(value: number, locale: 'en' | 'ru' = 'en'): string {
  const bytes = Math.max(0, Number.isFinite(value) ? value : 0)
  const units = locale === 'ru' ? ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'] : ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log2(bytes || 1) / 10), units.length - 1)
  const digits = index === 0 ? 0 : 1
  const formatter = formatters[`${locale}-${digits}`] ?? formatters[`en-${digits}`]
  const number = formatter.format(bytes / 1024 ** index)
  return `${number} ${units[index]}`
}
