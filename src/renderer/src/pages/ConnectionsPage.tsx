import { ConnectionCard } from '../components/connections/ConnectionCard'
import { ProcessGroupCard } from '../components/connections/ProcessGroupCard'
import { ProcessGroupHero } from '../components/connections/ProcessGroupHero'
import { useConnectionActions } from '../hooks/useConnectionActions'
import { filterConnections, groupConnections, sortConnections, type ConnectionProtocol, type ConnectionSort } from '../lib/connection-selectors'

import { ConnectionDetailsDialog } from '../components/ConnectionDetailsDialog'

import { useLocale, useTranslations } from '../i18n'
import { useState, useMemo } from 'react'
import { Search, Layers, ArrowLeft, ListFilter } from 'lucide-react'
import { ConnectionsIcon, DisconnectIcon } from '../lib/icons'
import type { ConnectionItem, ConnectionsSnapshot } from '@shared/mihomo'
import { Page } from '../components/Page'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'

export function ConnectionsPage({
  connections,
  onRefresh
}: {
  connections: ConnectionsSnapshot
  onRefresh: () => void
}) {
  const t = useTranslations('connections')
  const common = useTranslations('common')
  const locale = useLocale()

  const [viewMode, setViewMode] = useState<'process' | 'flat'>('process')
  const [selectedProcessKey, setSelectedProcessKey] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [flatLimit, setFlatLimit] = useState(100)
  const [processLimit, setProcessLimit] = useState(100)
  const [protocolFilter, setProtocolFilter] = useState<ConnectionProtocol>('all')
  const [sortBy, setSortBy] = useState<ConnectionSort>('traffic')
  const actions = useConnectionActions(onRefresh)
  const { selectedConnection, setSelectedConnection, copiedKey, closing, error, handleCopy, close } = actions

  const matchingConnections = useMemo(() => filterConnections(connections.connections, query, protocolFilter),
    [connections.connections, query, protocolFilter])
  const processGroups = useMemo(() => groupConnections(matchingConnections, sortBy, t('system')),
    [matchingConnections, sortBy, t])
  const filteredAndSortedList = useMemo(() => sortConnections(matchingConnections, sortBy, t('system')),
    [matchingConnections, sortBy, t])

  // Active selected group in drilldown view
  const activeProcessGroup = useMemo(() => {
    if (!selectedProcessKey) return null
    return processGroups.find((g) => g.key === selectedProcessKey) || null
  }, [selectedProcessKey, processGroups])

  // Keep selectedConnection fresh with real-time speed/data if it updates
  const activeDetail = useMemo(() => {
    if (!selectedConnection) return null
    return connections.connections.find((c) => c.id === selectedConnection.id) || selectedConnection
  }, [selectedConnection, connections.connections])

    const renderConnectionCard = (item: ConnectionItem) => <ConnectionCard key={item.id} item={item} actions={actions} />

  return (
    <Page
      title={selectedProcessKey && activeProcessGroup ? activeProcessGroup.name : t('connections')}
      actions={
        <div className="flex items-center gap-2">
          {selectedProcessKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedProcessKey(null)}
              className="gap-1.5 text-xs"
            >
              <ArrowLeft className="size-3.5" />
              <span>{t('backToProcesses')}</span>
            </Button>
          )}

          {/* View mode toggle: By Process vs Flat list */}
          <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('process')
                setSelectedProcessKey(null)
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'process'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
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
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                viewMode === 'flat'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ListFilter className="size-3" />
              <span>{t('allConnections')}</span>
            </button>
          </div>

          <Button
            onClick={() => close()}
            variant="destructive"
            size="sm"
            disabled={closing || !connections.connections.length}
            className="gap-1.5 text-xs"
          >
            <DisconnectIcon className="size-3.5" />
            <span>{t('closeAll')}</span>
          </Button>
        </div>
      }
    >
      {/* Search & Filters Header */}
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
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'traffic' | 'time' | 'process')}
            aria-label={t('sortBy')}
            className="h-8 rounded-lg border border-border/80 bg-muted/40 px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="traffic">{t('sortByTraffic')}</option>
            <option value="time">{t('sortByTime')}</option>
            <option value="process">{t('sortByProcess')}</option>
          </select>

          <span className="shrink-0 text-xs tabular-nums text-muted-foreground px-1">
            {viewMode === 'process' && !selectedProcessKey
              ? t('processesCount', { count: processGroups.length })
              : t('sessions', { count: filteredAndSortedList.length })}
          </span>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {/* Main Content View */}
      {viewMode === 'process' && selectedProcessKey && activeProcessGroup ? (
        /* Level 2: Drilldown into selected process */
        <div className="flex flex-col gap-3">
          {/* Hero Process Banner */}
          <ProcessGroupHero group={activeProcessGroup} actions={actions} />

          {/* List of connections for this process */}
          <div className="flex flex-col gap-2">
            {activeProcessGroup.connections.slice(0, processLimit).map(renderConnectionCard)}

            {activeProcessGroup.connections.length > processLimit && (
              <div className="flex justify-center pt-2 pb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProcessLimit((prev) => prev + 100)}
                  className="gap-2 text-xs"
                >
                  {t('showMore', { count: activeProcessGroup.connections.length - processLimit })}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'process' ? (
        /* Level 1: Process Cards List */
        <div className="flex flex-col gap-2">
          {processGroups.map(group => <ProcessGroupCard key={group.key} group={group} onSelect={setSelectedProcessKey} />)}

          {!processGroups.length && (
            <Card className="p-8 text-center flex flex-col items-center justify-center gap-3 border-dashed">
              <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                <ConnectionsIcon className="size-6" />
              </div>
              <p className="text-xs text-muted-foreground">
                {query ? t('noConnectionsMatchYourSearch') : t('noActiveConnections')}
              </p>
            </Card>
          )}
        </div>
      ) : (
        /* Flat Connections List */
        <div className="flex flex-col gap-2">
          {filteredAndSortedList.slice(0, flatLimit).map(renderConnectionCard)}

          {filteredAndSortedList.length > flatLimit && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFlatLimit((prev) => prev + 100)}
                className="gap-2 text-xs"
              >
                {t('showMore', { count: filteredAndSortedList.length - flatLimit })}
              </Button>
            </div>
          )}

          {!filteredAndSortedList.length && (
            <Card className="p-8 text-center flex flex-col items-center justify-center gap-3 border-dashed">
              <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                <ConnectionsIcon className="size-6" />
              </div>
              <p className="text-xs text-muted-foreground">
                {query ? t('noConnectionsMatchYourSearch') : t('noActiveConnections')}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Connection Details Modal with Monospace Code Lines & Embedded Copy Buttons */}
      <ConnectionDetailsDialog activeDetail={activeDetail} setSelectedConnection={setSelectedConnection} handleCopy={handleCopy} copiedKey={copiedKey} closing={closing} close={close} />
    </Page>
  )
}
