import { ConnectionToolbar } from '../components/connections/ConnectionToolbar'
import { ConnectionFilters } from '../components/connections/ConnectionFilters'
import { ConnectionEmptyState } from '../components/connections/ConnectionEmptyState'
import { ConnectionCard } from '../components/connections/ConnectionCard'
import { ProcessGroupCard } from '../components/connections/ProcessGroupCard'
import { ProcessGroupHero } from '../components/connections/ProcessGroupHero'
import { useConnectionActions } from '../hooks/useConnectionActions'
import { filterConnections, groupConnections, sortConnections, type ConnectionProtocol, type ConnectionSort } from '../lib/connection-selectors'

import { ConnectionDetailsDialog } from '../components/ConnectionDetailsDialog'
import { QuickRuleDialog } from '../components/connections/QuickRuleDialog'

import { useTranslations } from '../i18n'
import { useState, useMemo } from 'react'

import type { ConnectionItem, ConnectionsSnapshot } from '@shared/mihomo'
import type { ProcessGroup } from '../lib/connections'
import { Page } from '../components/Page'
import { VirtualList } from '../components/VirtualList'

export function ConnectionsPage({
  connections,
  onRefresh
}: {
  connections: ConnectionsSnapshot
  onRefresh: () => void
}) {
  const t = useTranslations('connections')

  const [viewMode, setViewMode] = useState<'process' | 'flat'>('process')
  const [selectedProcessKey, setSelectedProcessKey] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [protocolFilter, setProtocolFilter] = useState<ConnectionProtocol>('all')
  const [sortBy, setSortBy] = useState<ConnectionSort>('traffic')
  const [paused, setPaused] = useState(false)
  const [frozenSnapshot, setFrozenSnapshot] = useState<ConnectionsSnapshot | null>(null)
  const [ruleTargetConnection, setRuleTargetConnection] = useState<ConnectionItem | null>(null)
  const [ruleTargetGroup, setRuleTargetGroup] = useState<ProcessGroup | null>(null)
  const actions = useConnectionActions(onRefresh)

  const handleTogglePause = () => {
    if (paused) {
      setFrozenSnapshot(null)
      setPaused(false)
    } else {
      setFrozenSnapshot(connections)
      setPaused(true)
    }
  }

  const activeSnapshot = paused && frozenSnapshot ? frozenSnapshot : connections
  const { selectedConnection, setSelectedConnection, closing, error, close } = actions

  const matchingConnections = useMemo(() => filterConnections(activeSnapshot.connections, query, protocolFilter),
    [activeSnapshot.connections, query, protocolFilter])
  const processGroups = useMemo(() => viewMode === 'process' ? groupConnections(matchingConnections, sortBy, t('system')) : [],
    [viewMode, matchingConnections, sortBy, t])
  const filteredAndSortedList = useMemo(() => viewMode === 'flat' ? sortConnections(matchingConnections, sortBy, t('system')) : [],
    [viewMode, matchingConnections, sortBy, t])

  // Active selected group in drilldown view
  const activeProcessGroup = useMemo(() => {
    if (!selectedProcessKey) return null
    return processGroups.find((g) => g.key === selectedProcessKey) || null
  }, [selectedProcessKey, processGroups])

  // Keep selectedConnection fresh with real-time speed/data if it updates
  const activeDetail = useMemo(() => {
    if (!selectedConnection) return null
    return activeSnapshot.connections.find((c) => c.id === selectedConnection.id) || selectedConnection
  }, [selectedConnection, activeSnapshot.connections])

  const renderConnectionCard = (item: ConnectionItem) => (
    <ConnectionCard
      key={item.id}
      item={item}
      actions={{
        ...actions,
        onQuickRule: viewMode === 'flat' ? setRuleTargetConnection : undefined
      }}
    />
  )

  return (
    <Page
      title={selectedProcessKey && activeProcessGroup ? activeProcessGroup.name : t('connections')}
      actions={
        <ConnectionToolbar viewMode={viewMode} selectedProcessKey={selectedProcessKey}
          setViewMode={setViewMode} setSelectedProcessKey={setSelectedProcessKey}
          connectionCount={activeSnapshot.connections.length} actions={actions}
          paused={paused} onTogglePause={handleTogglePause} />
      }
    >
      {/* Search & Filters Header */}
      <div data-tour="connections">
      <ConnectionFilters query={query} setQuery={setQuery} protocolFilter={protocolFilter}
        setProtocolFilter={setProtocolFilter} sortBy={sortBy} setSortBy={setSortBy}
        viewMode={viewMode} selectedProcessKey={selectedProcessKey}
        processCount={processGroups.length} connectionCount={matchingConnections.length}
        paused={paused} />
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {/* Main Content View */}
      {viewMode === 'process' && selectedProcessKey && activeProcessGroup ? (
        /* Level 2: Drilldown into selected process */
        <div className="flex flex-col gap-3">
          {/* Hero Process Banner */}
          <ProcessGroupHero group={activeProcessGroup} actions={actions} onQuickRule={setRuleTargetGroup} />

          {/* List of connections for this process */}
          <VirtualList data={activeProcessGroup.connections} itemKey={item => item.id} renderItem={renderConnectionCard} />
        </div>
      ) : viewMode === 'process' ? (
        /* Level 1: Process Cards List */
        <div className="flex flex-col gap-2">
          <VirtualList
            data={processGroups}
            itemKey={group => group.key}
            renderItem={group => (
              <ProcessGroupCard
                group={group}
                onSelect={setSelectedProcessKey}
                onClose={actions.closeProcessConnections}
                onQuickRule={setRuleTargetGroup}
                closing={actions.closing}
              />
            )}
          />

          {!processGroups.length && (
            <ConnectionEmptyState query={query} />
          )}
        </div>
      ) : (
        /* Flat Connections List */
        <div className="flex flex-col gap-2">
          <VirtualList data={filteredAndSortedList} itemKey={item => item.id} renderItem={renderConnectionCard} />

          {!filteredAndSortedList.length && (
            <ConnectionEmptyState query={query} />
          )}
        </div>
      )}

      {/* Connection Details Modal with Monospace Code Lines & Embedded Copy Buttons */}
      <ConnectionDetailsDialog
        activeDetail={activeDetail}
        setSelectedConnection={setSelectedConnection}
        closing={closing}
        close={close}
        onQuickRule={(item) => {
          setSelectedConnection(null)
          setRuleTargetConnection(item)
        }}
      />

      {/* Quick Rule Creator Modal */}
      <QuickRuleDialog
        connection={ruleTargetConnection}
        processGroup={ruleTargetGroup}
        open={Boolean(ruleTargetConnection || ruleTargetGroup)}
        onOpenChange={(open) => { if (!open) { setRuleTargetConnection(null); setRuleTargetGroup(null) } }}
      />
    </Page>
  )
}
