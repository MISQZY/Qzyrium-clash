import { useTranslations } from '../i18n'
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { AutoscrollIcon } from '../lib/icons'
import { LogEntry } from '@shared/types'
import { Button } from '../components/ui/button'

interface LogsPageProps {
  logs: LogEntry[]
  onClear: () => void
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, onClear }) => {
  const t = useTranslations('logs')
  const common = useTranslations('common')

  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (levelFilter === 'all') return true
      return l.type.toLowerCase() === levelFilter || (levelFilter === 'warning' && l.type.toLowerCase() === 'warn')
    })
  }, [logs, levelFilter])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredLogs.length, autoScroll])

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
            {['all', 'info', 'warning', 'error'].map((lvl) => (
              <button
                key={common(lvl as 'all' | 'info' | 'warning' | 'error')}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-all cursor-pointer ${
                  levelFilter === lvl
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {common(lvl as 'all' | 'info' | 'warning' | 'error')}
              </button>
            ))}
          </div>

          <Button
            onClick={() => setAutoScroll(!autoScroll)}
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
          >
            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>

      {/* Terminal View Container */}
      <div ref={scrollRef} className="flex-1 min-w-0 min-h-0 rounded-xl bg-card border border-border p-4 font-mono text-xs overflow-y-auto select-text shadow-inner">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((item, idx) => (
            <div key={`${item.time}-${idx}-${item.type}`} className="flex items-start gap-2 py-0.5 leading-relaxed hover:bg-muted/20">
              <span className="text-muted-foreground/60 shrink-0 select-none">[{item.time}]</span>
              <span className={`shrink-0 uppercase text-[10px] ${getLevelColor(item.type)}`}>
                [{common(item.type.toLowerCase() as 'info' | 'warning' | 'error' | 'debug' | 'warn')}]
              </span>
              <span className="text-foreground/90 break-all">{item.payload}</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs select-none">
            {t('noLogEntriesRecordedYet')}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
