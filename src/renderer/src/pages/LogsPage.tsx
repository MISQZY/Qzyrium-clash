import { useTranslations, useLocale } from '../i18n'
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { Trash2, Copy, Check } from 'lucide-react'
import { AutoscrollIcon } from '../lib/icons'
import { LogEntry } from '@shared/types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { VirtualList } from '../components/VirtualList'
import { createLogPresenter, formatLogTime } from '../lib/log-presentation'
import { LogRow } from '../components/logs/LogRow'
import { copyToClipboard } from '../lib/clipboard'

interface LogsPageProps {
  logs: LogEntry[]
  onClear: (source: 'app' | 'mihomo') => void
}

const logLevels = ['all', 'debug', 'info', 'warning', 'error'] as const

function readPreference(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export const LogsPage: React.FC<LogsPageProps> = ({ logs, onClear }) => {
  const t = useTranslations('logs')
  const common = useTranslations('common')
  const locale = useLocale()
  const [source, setSource] = useState<'app' | 'mihomo'>(() => readPreference('logs_source') === 'app' ? 'app' : 'mihomo')

  const [levelFilter, setLevelFilter] = useState<string>(() => {
    const saved = readPreference('logs_level_filter')
    return logLevels.find((level) => level === saved) ?? 'all'
  })
  const [autoScroll, setAutoScroll] = useState(() => readPreference('logs_auto_scroll') !== 'false')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const presentLog = useMemo(() => createLogPresenter(), [])
  const scrollPosition = useRef(0)

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('logs_level_filter', levelFilter)
      localStorage.setItem('logs_auto_scroll', String(autoScroll))
      localStorage.setItem('logs_source', source)
    } catch { /* Keep the controls usable when storage is unavailable. */ }
  }, [levelFilter, autoScroll, source])
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }), [locale])
  const sourceLogs = useMemo(() => logs.filter(log => (log.source ?? 'app') === source).map(presentLog), [logs, source, presentLog])
  const searchQuery = search.trim().toLocaleLowerCase()
  const filteredLogs = useMemo(() => sourceLogs.filter(item =>
    (levelFilter === 'all' || item.level === levelFilter) && item.searchText.includes(searchQuery)),
  [sourceLogs, levelFilter, searchQuery])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const updateScroll = () => {
      if (autoScroll) {
        el.scrollTop = el.scrollHeight
      } else {
        el.scrollTop = scrollPosition.current || el.scrollTop
      }
      scrollPosition.current = el.scrollTop
    }
    updateScroll()
    const raf = requestAnimationFrame(() => {
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        scrollPosition.current = scrollRef.current.scrollTop
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [filteredLogs, autoScroll])

  // Observe layout for the lifetime of the scroll mode, independently of log batches.
  useEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content || !autoScroll) return
    const observer = new ResizeObserver(() => {
      el.scrollTop = el.scrollHeight
      scrollPosition.current = el.scrollTop
    })
    observer.observe(el)
    observer.observe(content)
    return () => observer.disconnect()
  }, [autoScroll])

  const handleCopy = async () => {
    if (!filteredLogs.length) return
    const text = filteredLogs
      .map(
        (item) =>
          `[${formatLogTime(item.time, timeFormatter)}] [${item.level.toUpperCase()}] ${item.message}`
      )
      .join('\n')
    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
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
            {logLevels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                aria-pressed={levelFilter === lvl}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors cursor-pointer ${
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
            onClick={() => setAutoScroll((value) => !value)}
            aria-pressed={autoScroll}
            variant={autoScroll ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
          >
            <AutoscrollIcon className="size-3.5" />
            <span className="text-[11px]">{t('autoscroll')}</span>
          </Button>

          <Button
            onClick={() => void handleCopy()}
            variant="outline"
            size="icon-sm"
            disabled={filteredLogs.length === 0}
            title={copied ? t('copied') : t('copyLogs')}
            aria-label={copied ? t('copied') : t('copyLogs')}
          >
            {copied ? (
              <Check className="size-3.5 text-primary" />
            ) : (
              <Copy className="size-3.5 text-muted-foreground hover:text-foreground" />
            )}
          </Button>

          <Button
            onClick={() => onClear(source)}
            variant="outline"
            size="icon-sm"
            title={t('clearLogs')}
            aria-label={t('clearLogs')}
          >
            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-1" role="group" aria-label={t('logSource')}>
          {(['mihomo', 'app'] as const).map(value => (
            <Button key={value} size="sm" variant={source === value ? 'default' : 'outline'}
              aria-pressed={source === value} onClick={() => { scrollPosition.current = 0; setSource(value) }}>
              {t(value === 'app' ? 'applicationLogs' : 'connectionLogs')}
            </Button>
          ))}
        </div>
        <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchLogs')} aria-label={t('searchLogs')} title={t('searchLogs')} className="max-w-sm" />
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{filteredLogs.length} / {sourceLogs.length}</span>
      </div>

      {/* Terminal View Container */}
      <div data-log-scroller ref={scrollRef} onScroll={(event) => { scrollPosition.current = event.currentTarget.scrollTop }} className="flex-1 min-w-0 min-h-0 rounded-xl bg-card border border-border p-4 font-mono text-xs overflow-y-auto [overflow-anchor:none] select-text shadow-inner">
        <div ref={contentRef} className={filteredLogs.length ? undefined : 'h-full'}>
        {filteredLogs.length > 0 ? (
          <VirtualList data={filteredLogs} itemKey={item => item.id} scrollParentSelector="[data-log-scroller]" gap={0}
            renderItem={item => <LogRow item={item} formatter={timeFormatter} />} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground font-mono text-xs select-none">
            {t(sourceLogs.length ? 'noMatchingEntries' : 'noLogEntriesRecordedYet')}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
