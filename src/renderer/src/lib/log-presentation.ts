import type { LogEntry } from '@shared/types'
import { cleanLogMessage, normalizeLogLevel } from '@shared/logs'

export interface PresentedLog {
  id: string
  time: string
  level: ReturnType<typeof normalizeLogLevel>
  message: string
  searchText: string
}

/** Ring snapshots retain entry identity; evicted entries can leave this weak cache. */
export function createLogPresenter() {
  const cache = new WeakMap<LogEntry, PresentedLog>()
  let sequence = 0
  return (entry: LogEntry): PresentedLog => {
    const cached = cache.get(entry)
    if (cached) return cached
    const message = cleanLogMessage(entry.payload)
    const value = { id: `log-${sequence++}`, time: entry.time, level: normalizeLogLevel(entry.type),
      message, searchText: message.toLocaleLowerCase() }
    cache.set(entry, value)
    return value
  }
}

export function formatLogTime(time: string, formatter: Intl.DateTimeFormat): string {
  let date = new Date(time)
  if (Number.isNaN(date.getTime()) && /^\d{1,2}:\d{2}:\d{2}/.test(time)) {
    const today = new Date().toISOString().slice(0, 10)
    date = new Date(`${today}T${time}`)
  }
  return Number.isNaN(date.getTime()) ? time.replace(/(\b\d{1,2}:\d{2}:\d{2})[.,]\d+/, '$1') : formatter.format(date)
}
