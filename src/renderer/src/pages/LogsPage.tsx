import { useTranslations, useLocale } from '../i18n'
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { AutoscrollIcon } from '../lib/icons'
import { LogEntry } from '@shared/types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { cleanLogMessage, normalizeLogLevel } from '@shared/logs'

interface LogsPageProps {
  logs: LogEntry[]
  onClear: () => void
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, onClear }) => {
  const t = useTranslations('logs')
  const common = useTranslations('common')
  const locale = useLocale()

  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const [search, setSearch] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false
  }), [locale])
  const displayTime = (time: string) => {
    const date = new Date(time)
    return Number.isNaN(date.getTime()) ? time : timeFormatter.format(date)
  }

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      return (levelFilter === 'all' || normalizeLogLevel(l.type) === levelFilter)
        && cleanLogMessage(l.payload).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    })
  }, [logs, levelFilter, search])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredLogs, autoScroll])

  const getLevelColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'warning':
      case 'warn':
        return 'text-warning font-semibold'
      case 'error':
        return 'text-destructive font-semibold'
      case 'debug':
        return 'text-muted-foreground'
      default:
        return 'text-primary font-semibold'
    }
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 h-full p-5 flex flex-col gap-4 overflow-hidden">
      {/* Header & Controls */}
      <div className="page-heading shrink-0">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('logs')}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Level Filter Buttons */}
          <div className="flex items-center rounded-lg bg-muted/60 border border-border p-0.5 text-xs">
            {(['all', 'debug', 'info', 'warning', 'error'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                aria-pressed={levelFilter === lvl}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-all cursor-pointer ${
                  levelFilter === lvl
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {common(lvl)}
              </button>
            ))}
          </div>

          <Button
            onClick={() => setAutoScroll(!autoScroll)}
            aria-pressed={autoScroll}
            variant={autoScroll ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
          >
            <AutoscrollIcon className="size-3.5" />
            <span className="text-[11px]">{t('autoscroll')}</span>
          </Button>

          <Button
            onClick={onClear}
            variant="outline"
            size="icon-sm"
            title={t('clearLogs')}
            aria-label={t('clearLogs')}
          >
            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchLogs')} aria-label={t('searchLogs')} className="max-w-sm" />
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{filteredLogs.length} / {logs.length}</span>
      </div>

      {/* Terminal View Container */}
      <div ref={scrollRef} className="flex-1 min-w-0 min-h-0 rounded-xl bg-card border border-border p-4 font-mono text-xs overflow-y-auto select-text shadow-inner">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((item, idx) => (
            <div key={`${item.time}-${idx}-${item.type}`} className="grid grid-cols-[auto_6rem_minmax(0,1fr)] items-start gap-3 py-1 leading-relaxed border-b border-border/40 last:border-0 hover:bg-muted/20">
              <time className="text-muted-foreground shrink-0 tabular-nums" title={item.time}>[{displayTime(item.time)}]</time>
              <span className={`uppercase text-[10px] pt-px ${getLevelColor(item.type)}`}>
                {common(normalizeLogLevel(item.type))}
              </span>
              <span className="min-w-0 text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">{cleanLogMessage(item.payload)}</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs select-none">
            {t(logs.length ? 'noMatchingEntries' : 'noLogEntriesRecordedYet')}
          </div>
        )}
      </div>
    </div>
  )
}
