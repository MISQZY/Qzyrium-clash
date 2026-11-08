import React, { useState, useRef, useEffect } from 'react'
import { Trash2, ArrowDownCircle } from 'lucide-react'
import { LogEntry } from '@shared/types'
import { Button } from '../components/ui/button'

interface LogsPageProps {
  logs: LogEntry[]
  onClear: () => void
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, onClear }) => {
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const filteredLogs = logs.filter((l) => {
    if (levelFilter === 'all') return true
    return l.type.toLowerCase() === levelFilter
  })

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
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
    <div className="flex-1 min-h-0 h-full p-6 flex flex-col gap-4 overflow-hidden">
      {/* Header & Controls */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-base font-semibold text-foreground">Core Logs</h2>
          <p className="text-xs text-muted-foreground">Real-time output stream from Mihomo engine</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Level Filter Buttons */}
          <div className="flex items-center rounded-lg bg-muted/60 border border-border p-0.5 text-xs">
            {['all', 'info', 'warning', 'error'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-all cursor-pointer ${
                  levelFilter === lvl
                    ? 'bg-card text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <Button
            onClick={() => setAutoScroll(!autoScroll)}
            variant={autoScroll ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
          >
            <ArrowDownCircle className="size-3.5" />
            <span className="text-[11px]">Autoscroll</span>
          </Button>

          <Button
            onClick={onClear}
            variant="outline"
            size="icon-sm"
            title="Clear logs"
          >
            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>

      {/* Terminal View Container */}
      <div className="flex-1 min-h-0 rounded-xl bg-card/90 border border-border p-4 font-mono text-xs overflow-y-auto select-text shadow-inner">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 py-0.5 leading-relaxed hover:bg-muted/20">
              <span className="text-muted-foreground/60 shrink-0 select-none">[{item.time}]</span>
              <span className={`shrink-0 uppercase text-[10px] ${getLevelColor(item.type)}`}>
                [{item.type}]
              </span>
              <span className="text-foreground/90 break-all">{item.payload}</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs select-none">
            No log entries recorded yet.
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
