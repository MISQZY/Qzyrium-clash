import { ProxyGroupCard } from '../components/ProxyGroupCard'
import { useProxyLatency } from '../hooks/useProxyLatency'
import { useTranslations } from '../i18n'
import React, { useState, useEffect, useMemo } from 'react'
import { ArrowUpDown, ChevronsUpDown, Search, X } from 'lucide-react'
import { LatencyIcon } from '../lib/icons'
import type { ProxyGroup, ProxyNode, MihomoRule } from '@shared/mihomo'
import type { TunnelMode } from '@shared/types'
import { Button } from '../components/ui/button'

import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
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
}

export const ProxiesPage: React.FC<ProxiesPageProps> = ({
  running,
  proxies,
  rules,
  mode = 'rule',
  delays: externalDelays,
  onUpdateDelays,
  onSelectNode,
  testConcurrency = 6
}) => {
  const t = useTranslations('proxies')

  const { delays, testingGroup, testingAll, testGroup, testAll } = useProxyLatency({
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
    if (!trimmedQuery) return groupNames
    return groupNames.filter((name) => {
      if (name.toLowerCase().includes(trimmedQuery)) return true
      const group = proxies[name] as unknown as ProxyGroup
      return (group?.all || []).some((node) => node.toLowerCase().includes(trimmedQuery))
    })
  }, [groupNames, proxies, trimmedQuery])

  return (
    <div className="page-scroll">
      {/* Top Header */}
      <div data-tour="proxies" className="page-heading">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('proxies')}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Node Sorting Control */}
          {groupNames.length > 0 && (
            <div className="flex items-center gap-1 bg-muted/60 rounded-md p-0.5 border border-border/60">
              <span className="sr-only">{t('sort')}</span>
              <button
                type="button"
                onClick={() => setSortMode('default')}
                className={cn(
                  'px-2 py-1 text-[11px] rounded transition-colors font-medium',
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
                  'px-2 py-1 text-[11px] rounded transition-colors font-medium flex items-center gap-1',
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
                  'px-2 py-1 text-[11px] rounded transition-colors font-medium',
                  sortMode === 'name'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title={t('sortName')}
              >
                {t('sortName')}
              </button>
            </div>
          )}

          {groupNames.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleExpandAll}
              className="text-xs gap-1.5"
            >
              <ChevronsUpDown className="size-3.5 text-muted-foreground" />
              <span>{allExpanded ? t('collapseAll') : t('expandAll')}</span>
            </Button>
          )}

          <Button
            onClick={() => testAll(allNodes)}
            disabled={!running || testingAll || !!testingGroup || allNodes.length === 0}
            title={!running ? t('latencyRequiresConnection') : undefined}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <LatencyIcon
              className={`size-3.5 ${testingAll ? 'animate-pulse text-warning' : 'text-primary'}`}
            />
            <span>{testingAll ? t('testing') : t('testLatency')}</span>
          </Button>
        </div>
      </div>

      {!running && <p className="text-xs leading-relaxed text-muted-foreground">{t('offlineSelectionHint')}</p>}

      {/* Search Input with Clear Button */}
      {groupNames.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            aria-label={t('searchProxyNodes')}
            placeholder={t('searchProxyNodes')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9 pr-8 text-xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
              aria-label={t('clearSearch')}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* List of Expandable Group Cards */}
      {filteredGroups.length > 0 ? (
        <div className="flex flex-col gap-3">
          {filteredGroups.map(groupName => <ProxyGroupCard key={groupName} groupName={groupName}
            group={proxies[groupName] as ProxyGroup} proxies={proxies} delays={delays}
            isExpanded={!!trimmedQuery || expandedGroups.has(groupName)} trimmedQuery={trimmedQuery} sortMode={sortMode}
            running={running} testingGroup={testingGroup} testingAll={testingAll}
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
