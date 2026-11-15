import { ProxyGroupCard } from '../components/ProxyGroupCard'
import { useProxyLatency } from '../hooks/useProxyLatency'
import { useTranslations } from '../i18n'
import React, { useState, useEffect, useMemo } from 'react'
import { ArrowUpDown, CheckCircle2, ChevronsUpDown, Search, X } from 'lucide-react'
import { LatencyIcon } from '../lib/icons'
import type { ProxyGroup, ProxyNode, MihomoRule } from '@shared/mihomo'
import type { TunnelMode } from '@shared/types'
import { Button } from '../components/ui/button'

import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { ProvidersDialog } from '../components/ProvidersDialog'
import { cn } from '../lib/utils'

import { visibleProxyGroups, type ProxySortMode } from '../lib/proxies'
export type { ProxySortMode } from '../lib/proxies'

interface ProxiesPageProps {
  running: boolean
  proxies: Record<string, ProxyNode>
  rules?: MihomoRule[]
  mode?: TunnelMode
  delays?: Record<string, number>
  onUpdateDelays?: (delays: Record<string, number>) => void
  onSelectNode: (group: string, node: string) => void
  testConcurrency?: number
  onRefresh?: () => Promise<unknown>
  profileId?: string
}

export const ProxiesPage: React.FC<ProxiesPageProps> = ({
  running,
  proxies,
  rules,
  mode = 'rule',
  delays: externalDelays,
  onUpdateDelays,
  onSelectNode,
  testConcurrency = 6,
  onRefresh,
  profileId
}) => {
  const t = useTranslations('proxies')

  const { delays, testingGroups, testingAll, testingNodes, testGroup, testAll } = useProxyLatency({
    running, proxies, delays: externalDelays, onUpdateDelays, concurrency: testConcurrency
  })

  // Filter & collect proxy groups:
  // 1. In 'rule' mode, gather only selectors/groups actively referenced in rules (and their sub-groups).
  // 2. Filter out groups marked with `hidden: true`.
  // 3. Filter out Mihomo's synthetic 'GLOBAL' unless mode is 'global'.
  // 4. Filter out built-in non-proxy targets (Direct, Reject, Pass, Compatible).
  const groupNames = useMemo(() => visibleProxyGroups(proxies, rules, mode), [proxies, rules, mode])

  // By default, expand only the first group to avoid cognitive overload with 100+ nodes
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    return groupNames.length > 0 ? new Set([groupNames[0]]) : new Set()
  })

  // Synchronize when groups first load
  useEffect(() => {
    setExpandedGroups((prev) => {
      if (prev.size === 0 && groupNames.length > 0) {
        return new Set([groupNames[0]])
      }
      return prev
    })
  }, [groupNames])

  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<ProxySortMode>('default')
  const [onlyAvailable, setOnlyAvailable] = useState(false)

  // Collect all unique nodes across eligible groups
  const allNodes = useMemo(() => {
    const set = new Set<string>()
    for (const name of groupNames) {
      const group = proxies[name] as unknown as ProxyGroup
      for (const node of group.all || []) {
        set.add(node)
      }
    }
    return Array.from(set)
  }, [proxies, groupNames])

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const allExpanded = groupNames.length > 0 && groupNames.every((g) => expandedGroups.has(g))

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedGroups(new Set())
    } else {
      setExpandedGroups(new Set(groupNames))
    }
  }

  const trimmedQuery = query.trim().toLowerCase()

  // Filter groups: show group if its name matches OR if any of its nodes match
  const filteredGroups = useMemo(() => {
    const isNodeAvailable = (nodeName: string) => {
      const nodeData = proxies[nodeName]
      const delay = delays[nodeName] ?? nodeData?.history?.[nodeData?.history?.length - 1]?.delay
      return delay !== undefined && delay > 0
    }

    return groupNames.filter((name) => {
      const group = proxies[name] as unknown as ProxyGroup
      const groupNodes = group?.all || []

      if (trimmedQuery) {
        const matchesQuery =
          name.toLowerCase().includes(trimmedQuery) ||
          groupNodes.some((node) => node.toLowerCase().includes(trimmedQuery))
        if (!matchesQuery) return false
      }

      if (onlyAvailable) {
        return groupNodes.some(isNodeAvailable)
      }

      return true
    })
  }, [groupNames, proxies, trimmedQuery, onlyAvailable, delays])

  return (
    <div className="page-scroll">
      {/* Top Header */}
      <div data-tour="proxies" className="page-heading">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('proxies')}</h1>
        </div>

        <div className="flex items-center gap-2">
          {groupNames.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleExpandAll}
              className="text-xs gap-1.5"
            >
              <ChevronsUpDown className="size-4 text-muted-foreground" />
              <span>{allExpanded ? t('collapseAll') : t('expandAll')}</span>
            </Button>
          )}

          <Button
            onClick={() => testAll(allNodes)}
            disabled={!running || testingAll || testingGroups.size > 0 || allNodes.length === 0}
            title={!running ? t('latencyRequiresConnection') : undefined}
            variant="outline"
            size="sm"
            className={cn('gap-2', testingAll && 'latency-testing-button')}
            aria-busy={testingAll}
          >
            <LatencyIcon
              className="size-4 text-muted-foreground"
            />
            <span className="grid whitespace-nowrap">
              <span className={cn('col-start-1 row-start-1', testingAll && 'invisible')} aria-hidden={testingAll}>
                {t('testLatency')}
              </span>
              <span className={cn('col-start-1 row-start-1', !testingAll && 'invisible')} aria-hidden={!testingAll}>
                {t('testing')}
              </span>
            </span>
          </Button>

          <ProvidersDialog
            key={profileId}
            kind="proxies"
            running={running}
            onUpdated={onRefresh}
          />
        </div>
      </div>

      {!running && <p className="text-xs leading-relaxed text-muted-foreground">{t('offlineSelectionHint')}</p>}

      {/* Search and Filters Toolbar */}
      {groupNames.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Input with Clear Button */}
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              aria-label={t('searchProxyNodes')}
              title={t('searchProxyNodes')}
              placeholder={t('searchProxyNodes')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9 pr-8 text-xs h-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                aria-label={t('clearSearch')}
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Filters & Sorting Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Available Only Toggle Button */}
            <Button
              type="button"
              variant={onlyAvailable ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setOnlyAvailable((prev) => !prev)}
              className={cn(
                'text-xs h-8 gap-1.5 transition-colors shrink-0',
                onlyAvailable && 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
              )}
              title={t('onlyAvailable')}
              aria-pressed={onlyAvailable}
            >
              <CheckCircle2 className="size-3.5" />
              <span>{t('onlyAvailable')}</span>
            </Button>

            {/* Node Sorting Control */}
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-md p-0.5 border border-border/60 shrink-0 h-8">
              <span className="sr-only">{t('sort')}</span>
              <button
                type="button"
                onClick={() => setSortMode('default')}
                className={cn(
                  'px-2 py-1 text-[11px] rounded transition-colors font-medium h-7',
                  sortMode === 'default'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={t('sortDefault')}
              >
                {t('sortDefault')}
              </button>
              <button
                type="button"
                onClick={() => setSortMode('latency')}
                className={cn(
                  'px-2 py-1 text-[11px] rounded transition-colors font-medium flex items-center gap-1 h-7',
                  sortMode === 'latency'
                    ? 'bg-background text-primary shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={t('sortLatency')}
              >
                <ArrowUpDown className="size-3" />
                <span>{t('sortLatency')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSortMode('name')}
                className={cn(
                  'px-2 py-1 text-[11px] rounded transition-colors font-medium h-7',
                  sortMode === 'name'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={t('sortName')}
              >
                {t('sortName')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List of Expandable Group Cards */}
      {filteredGroups.length > 0 ? (
        <div className="flex flex-col gap-3">
          {filteredGroups.map(groupName => <ProxyGroupCard key={groupName} groupName={groupName}
            group={proxies[groupName] as ProxyGroup} proxies={proxies} delays={delays}
            isExpanded={!!trimmedQuery || expandedGroups.has(groupName)} trimmedQuery={trimmedQuery} sortMode={sortMode}
            onlyAvailable={onlyAvailable}
            running={running} testingGroups={testingGroups} testingAll={testingAll} testingNodes={testingNodes}
            onToggle={toggleGroup} onTest={testGroup} onSelect={onSelectNode} />)}
        </div>
      ) : groupNames.length > 0 ? (
        <p className="empty-state">{t('noProxyNodesMatchYourSearch')}</p>
      ) : (
        <Card className="p-12 text-center flex flex-col items-center justify-center">
          <span className="text-sm font-medium text-foreground">
            {t('noProxyNodesAvailable')}
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            {t('importASubscriptionInTheProfilesTabToPopulateProxyNodes')}
          </span>
        </Card>
      )}
    </div>
  )
}
