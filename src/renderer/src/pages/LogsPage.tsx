import React, { useState, useRef, useEffect } from 'react'
import { Trash2, ArrowDownCircle } from 'lucide-react'
import { LogEntry } from '@shared/types'

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
        return 'text-amber-400'
      case 'error':
        return 'text-rose-400'
      case 'debug':
        return 'text-slate-500'
      default:
        return 'text-emerald-400'
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6 h-[calc(100vh-2.5rem)]">
      {/* Header & Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Core Runtime Logs</h2>
          <p className="text-xs text-slate-400">Standard output and diagnostic events from Mihomo</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
            {['all', 'info', 'warning', 'error'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition-all ${
                  levelFilter === lvl ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
              autoScroll
                ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Auto-scroll"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            <span className="text-[11px]">Autoscroll</span>
          </button>

          <button
            onClick={onClear}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <div className="flex-1 rounded-xl bg-slate-950/80 border border-slate-800/80 p-4 font-mono text-xs overflow-y-auto select-text shadow-inner">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 py-0.5 leading-relaxed hover:bg-slate-900/40">
              <span className="text-slate-500 shrink-0 select-none">[{item.time}]</span>
              <span className={`shrink-0 uppercase font-semibold text-[10px] ${getLevelColor(item.type)}`}>
                [{item.type}]
              </span>
              <span className="text-slate-300 break-all">{item.payload}</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 font-mono text-xs select-none">
            No log entries recorded yet.
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
