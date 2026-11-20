import { NativeSelect } from '../ui/native-select'
import { type ConnectionProtocol, type ConnectionSort } from '../../lib/connection-selectors'
import { useTranslations } from '../../i18n'
import { Search, Layers, ListFilter } from 'lucide-react'
import { Input } from '../ui/input'
import { cn } from '../../lib/utils'

interface ConnectionFiltersProps {
  query: string
  setQuery: (value: string) => void
  protocolFilter: ConnectionProtocol
  setProtocolFilter: (value: ConnectionProtocol) => void
  sortBy: ConnectionSort
  setSortBy: (value: ConnectionSort) => void
  viewMode: 'process' | 'flat'
  setViewMode: (mode: 'process' | 'flat') => void
  selectedProcessKey: string | null
  setSelectedProcessKey: (key: string | null) => void
  processCount: number
  connectionCount: number
  paused?: boolean
}

export function ConnectionFilters({
  query,
  setQuery,
  protocolFilter,
  setProtocolFilter,
  sortBy,
  setSortBy,
  viewMode,
  setViewMode,
  selectedProcessKey,
  setSelectedProcessKey,
  processCount,
  connectionCount,
  paused
}: ConnectionFiltersProps) {
  const t = useTranslations('connections')

  return (
    <div className="flex flex-col gap-2.5">
      {/* Top row: View mode segmented toggle and live status / counters */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setViewMode('process')
              setSelectedProcessKey(null)
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              viewMode === 'process' && !selectedProcessKey
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Layers className="size-3" />
            <span>{t('groupByProcess')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('flat')
              setSelectedProcessKey(null)
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              viewMode === 'flat'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ListFilter className="size-3" />
            <span>{t('allConnections')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0">
          {paused && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>{t('livePaused')}</span>
            </span>
          )}

          <span className="tabular-nums text-muted-foreground px-1">
            {viewMode === 'process' && !selectedProcessKey
              ? t('processesCount', { count: processCount })
              : t('sessions', { count: connectionCount })}
          </span>
        </div>
      </div>

      {/* Bottom row: Search input and filters (protocol chips + sort dropdown) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            aria-label={t('searchConnections')}
            title={t('searchHostProcessOrRoutingRule')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9 h-8 text-xs"
            placeholder={t('searchHostProcessOrRoutingRule')}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Protocol filter chips */}
          <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
            {(['all', 'tcp', 'udp'] as const).map((proto) => (
              <button
                key={proto}
                type="button"
                onClick={() => setProtocolFilter(proto)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                  protocolFilter === proto
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {proto === 'all' ? t('all') : proto.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Sort selector */}
          <NativeSelect
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ConnectionSort)}
            aria-label={t('sortBy')}
            className="h-8"
          >
            <option value="traffic">{t('sortByTraffic')}</option>
            <option value="time">{t('sortByTime')}</option>
            <option value="process">{t('sortByProcess')}</option>
          </NativeSelect>
        </div>
      </div>
    </div>
  )
}
