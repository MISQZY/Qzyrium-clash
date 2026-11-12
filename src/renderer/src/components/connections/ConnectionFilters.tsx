import { NativeSelect } from '../ui/native-select'
import { type ConnectionProtocol, type ConnectionSort } from '../../lib/connection-selectors'

import { useTranslations } from '../../i18n'

import { Search } from 'lucide-react'

import { Input } from '../ui/input'

interface ConnectionFiltersProps {
  query: string; setQuery: (value: string) => void
  protocolFilter: ConnectionProtocol; setProtocolFilter: (value: ConnectionProtocol) => void
  sortBy: ConnectionSort; setSortBy: (value: ConnectionSort) => void
  viewMode: 'process' | 'flat'; selectedProcessKey: string | null
  processCount: number; connectionCount: number
}

export function ConnectionFilters({ query, setQuery, protocolFilter, setProtocolFilter, sortBy, setSortBy, viewMode, selectedProcessKey, processCount, connectionCount }: ConnectionFiltersProps) {
  const t = useTranslations('connections')

  return (
<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label={t('searchConnections')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9 h-9 text-xs"
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
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  protocolFilter === proto
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
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

          <span className="shrink-0 text-xs tabular-nums text-muted-foreground px-1">
            {viewMode === 'process' && !selectedProcessKey
              ? t('processesCount', { count: processCount })
              : t('sessions', { count: connectionCount })}
          </span>
        </div>
      </div>
  )
}
