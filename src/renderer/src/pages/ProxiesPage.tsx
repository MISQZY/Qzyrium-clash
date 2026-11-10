import { useTranslations } from '../i18n'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowUpDown, ChevronDown, ChevronsUpDown, Search, X } from 'lucide-react'
import { LatencyIcon, ProxiesIcon } from '../lib/icons'
import type { ProxyGroup, ProxyNode, MihomoRule } from '@shared/mihomo'
import type { TunnelMode } from '@shared/types'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { cn } from '../lib/utils'
import { EmojiText } from '../components/EmojiText'

export type ProxySortMode = 'default' | 'latency' | 'name'

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

const GroupIcon: React.FC<{ icon?: string; name: string }> = ({ icon, name }) => {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [icon])

  if (icon && !hasError) {
    return (
      <div className="flex items-center justify-center size-8 rounded-lg bg-muted/60 shrink-0 border border-border/70 overflow-hidden p-1">
        <img
          src={icon}
          alt={name}
          className="size-full object-contain"
          onError={() => setHasError(true)}
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary shrink-0 border border-primary/20">
      <ProxiesIcon className="size-4" />
    </div>
  )
}

const NodeIcon: React.FC<{ icon?: string; name: string; isSelected: boolean }> = ({
  icon,
  name,
  isSelected
}) => {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [icon])

  if (icon && !hasError) {
    return (
      <img
        src={icon}
        alt={name}
        className="size-3.5 object-contain shrink-0 rounded-xs"
        onError={() => setHasError(true)}
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={cn(
        'size-2 rounded-full shrink-0 transition-colors',
        isSelected ? 'bg-primary shadow-xs shadow-primary' : 'bg-muted-foreground/30'
      )}
    />
  )
}

const getGroupTypeStyle = (type?: string): { label: string; className: string } => {
  const raw = (type || '').toLowerCase().replace(/[-_]/g, '')
  if (raw === 'urltest') {
    return {
      label: 'AUTO',
      className: 'border-success/40 bg-success/10 text-success'
    }
  }
  if (raw === 'selector' || raw === 'select') {
    return {
      label: 'SELECTOR',
      className: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400'
    }
  }
  if (raw === 'fallback') {
    return {
      label: 'FALLBACK',
      className: 'border-warning/40 bg-warning/10 text-warning'
    }
  }
  if (raw === 'loadbalance') {
    return {
      label: 'LOAD-BALANCE',
      className: 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400'
    }
  }
  if (raw === 'relay') {
    return {
      label: 'RELAY',
      className: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
    }
  }
  return {
    label: (type || 'GROUP').toUpperCase(),
    className: 'border-border/80 bg-muted/50 text-muted-foreground'
  }
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

  // Local fallback state if external store is not provided
  const [internalDelays, setInternalDelays] = useState<Record<string, number>>({})
  const delays = externalDelays ?? internalDelays

  const setDelay = useCallback(
    (node: string, delay: number) => {
      if (onUpdateDelays) {
        onUpdateDelays({ [node]: delay })
      } else {
        setInternalDelays((prev) => ({ ...prev, [node]: delay }))
      }
    },
    [onUpdateDelays]
  )

  const setBatchDelays = useCallback(
    (batch: Record<string, number>) => {
      if (onUpdateDelays) {
        onUpdateDelays(batch)
      } else {
        setInternalDelays((prev) => ({ ...prev, ...batch }))
      }
    },
    [onUpdateDelays]
  )

  // Filter & collect proxy groups:
  // 1. In 'rule' mode, gather only selectors/groups actively referenced in rules (and their sub-groups).
  // 2. Filter out groups marked with `hidden: true`.
  // 3. Filter out Mihomo's synthetic 'GLOBAL' unless mode is 'global'.
  // 4. Filter out built-in non-proxy targets (Direct, Reject, Pass, Compatible).
  const groupNames = useMemo(() => {
    const list: string[] = []
    const visited = new Set<string>()

    const isEligibleGroup = (name: string): boolean => {
      const item = proxies[name] as unknown as ProxyGroup | undefined
      if (!item || !Array.isArray(item.all)) return false
      if (item.hidden) return false
      if (name === 'GLOBAL' && mode !== 'global') return false
      const rawType = (item.type || '').toLowerCase()
      if (rawType === 'direct' || rawType === 'reject' || rawType === 'compatible' || rawType === 'pass') {
        return false
      }
      return true
    }

    const addGroup = (name: string) => {
      if (!name || visited.has(name)) return
      visited.add(name)
      if (!isEligibleGroup(name)) return
      list.push(name)

      // Traverse sub-groups contained inside this group's .all
      const group = proxies[name] as unknown as ProxyGroup
      for (const childName of group.all || []) {
        if (proxies[childName] && Array.isArray((proxies[childName] as unknown as ProxyGroup).all)) {
          addGroup(childName)
        }
      }
    }

    if (mode === 'global') {
      if (proxies['GLOBAL'] && isEligibleGroup('GLOBAL')) {
        addGroup('GLOBAL')
      }
      for (const name of Object.keys(proxies)) {
        addGroup(name)
      }
    } else if (rules && rules.length > 0) {
      for (const rule of rules) {
        addGroup(rule.proxy)
      }
    }

    // Fallback if rules gave no groups (or rules empty / loading)
    if (list.length === 0) {
      for (const name of Object.keys(proxies)) {
        addGroup(name)
      }
    }

    return list
  }, [proxies, rules, mode])

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

  const [testingGroup, setTestingGroup] = useState<string | null>(null)
  const [testingAll, setTestingAll] = useState(false)
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

  // Keep the configured number of latency requests in flight with batched UI updates.
  const runConcurrentLatencyTests = async (
    nodeNames: string[],
    concurrency = testConcurrency
  ): Promise<void> => {
    if (!running || !window.api || nodeNames.length === 0) return
    let index = 0
    const batch: Record<string, number> = {}
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flushBatch = () => {
      if (Object.keys(batch).length > 0) {
        setBatchDelays({ ...batch })
      }
    }

    const scheduleFlush = () => {
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null
          flushBatch()
        }, 200)
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, nodeNames.length) }, async () => {
      while (index < nodeNames.length) {
        const currentIndex = index++
        const nodeName = nodeNames[currentIndex]
        try {
          const delay = await window.api.mihomo.testDelay(nodeName)
          batch[nodeName] = delay
        } catch {
          batch[nodeName] = -1
        }
        scheduleFlush()
      }
    })

    await Promise.all(workers)
    if (flushTimer) clearTimeout(flushTimer)
    flushBatch()
  }

  const handleTestGroupLatency = async (groupName: string, nodes: string[]) => {
    if (testingGroup || testingAll || nodes.length === 0) return
    setTestingGroup(groupName)
    try {
      await runConcurrentLatencyTests(nodes)
    } finally {
      setTestingGroup(null)
    }
  }

  const handleTestAllLatency = async () => {
    if (testingAll || testingGroup || allNodes.length === 0) return
    setTestingAll(true)
    try {
      await runConcurrentLatencyTests(allNodes)
    } finally {
      setTestingAll(false)
    }
  }

  const renderDelayBadge = (delay?: number) => {
    if (delay === undefined) return null
    if (delay === -1) {
      return (
        <Badge variant="destructive" className="text-[10px] py-0 px-1.5 font-mono">
          {t('timeout')}
        </Badge>
      )
    }
    if (delay < 200) {
      return (
        <Badge variant="success" className="text-[10px] py-0 px-1.5 font-mono">
          {t('latency', { delay })}
        </Badge>
      )
    }
    if (delay < 500) {
      return (
        <Badge variant="warning" className="text-[10px] py-0 px-1.5 font-mono">
          {t('latency', { delay })}
        </Badge>
      )
    }
    return (
      <Badge variant="destructive" className="text-[10px] py-0 px-1.5 font-mono">
        {t('latency', { delay })}
      </Badge>
    )
  }

  // Node sorting within a group
  const sortNodes = useCallback(
    (nodes: string[]): string[] => {
      if (sortMode === 'default') return nodes
      const copy = [...nodes]

      if (sortMode === 'name') {
        return copy.sort((a, b) => a.localeCompare(b))
      }

      if (sortMode === 'latency') {
        return copy.sort((a, b) => {
          const nodeDataA = proxies[a]
          const nodeDataB = proxies[b]
          const da = delays[a] ?? nodeDataA?.history?.[nodeDataA.history.length - 1]?.delay
          const db = delays[b] ?? nodeDataB?.history?.[nodeDataB.history.length - 1]?.delay

          const getWeight = (d?: number) => {
            if (d === undefined) return 999998 // Untested comes before failed
            if (d <= 0) return 999999 // Timeout / error comes last
            return d
          }

          const wa = getWeight(da)
          const wb = getWeight(db)
          if (wa !== wb) return wa - wb
          return a.localeCompare(b)
        })
      }

      return nodes
    },
    [sortMode, delays, proxies]
  )

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
      <div className="page-heading">
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
            onClick={handleTestAllLatency}
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
          {filteredGroups.map((groupName) => {
            const group = proxies[groupName] as unknown as ProxyGroup
            const nodes = group?.all || []
            const activeNow = group?.now || ''
            const isExpanded = trimmedQuery ? true : expandedGroups.has(groupName)
            const isGroupTesting = testingGroup === groupName

            const matchingNodes = trimmedQuery
              ? nodes.filter(
                  (n) =>
                    n.toLowerCase().includes(trimmedQuery) ||
                    groupName.toLowerCase().includes(trimmedQuery)
                )
              : nodes

            const sortedNodes = sortNodes(matchingNodes)
            const typeMeta = getGroupTypeStyle(group?.type)

            return (
              <Card
                key={groupName}
                className="overflow-hidden border border-border/70 bg-card transition-colors"
              >
                {/* Clickable Card Header */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleGroup(groupName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleGroup(groupName)
                    }
                  }}
                  className="flex items-center justify-between gap-3 p-3.5 sm:px-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                >
                  {/* Left: Group identity & active selection */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <GroupIcon icon={group?.icon} name={groupName} />

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">
                          <EmojiText text={groupName} />
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] font-mono font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md shrink-0 transition-colors',
                            typeMeta.className
                          )}
                        >
                          {typeMeta.label}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground min-w-0">
                        <span className="text-[11px] shrink-0">{t('activeNode')}:</span>
                        <span className="font-medium text-foreground text-[11px] truncate" title={activeNow || '—'}>
                          <EmojiText text={activeNow || '—'} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions & Chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!running || isGroupTesting || testingAll || nodes.length === 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTestGroupLatency(groupName, nodes)
                      }}
                      className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                      title={t('testGroup')}
                    >
                      <LatencyIcon
                        className={`size-3.5 ${
                          isGroupTesting ? 'animate-pulse text-warning' : 'text-primary'
                        }`}
                      />
                      <span className="hidden sm:inline">
                        {isGroupTesting ? t('testing') : t('testGroup')}
                      </span>
                    </Button>

                    <div className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown
                        className={cn(
                          'size-4 transition-transform duration-200',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Expanded Content: Node Options Grid */}
                {isExpanded && (
                  <div className="px-3.5 sm:px-4 pb-4 pt-1 border-t border-border/50 bg-background/30">
                    {sortedNodes.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
                        {sortedNodes.map((nodeName) => {
                          const isSelected = activeNow === nodeName
                          const nodeData = proxies[nodeName]
                          const nodeType = nodeData?.type || 'direct'
                          const delay =
                            delays[nodeName] ??
                            nodeData?.history?.[nodeData.history.length - 1]?.delay

                          return (
                            <button
                              key={nodeName}
                              type="button"
                              role="button"
                              tabIndex={0}
                              aria-label={t('selectNode', { name: nodeName })}
                              aria-pressed={isSelected}
                              onClick={() => onSelectNode(groupName, nodeName)}
                              className={cn(
                                'relative flex items-center justify-between gap-2.5 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer',
                                isSelected
                                  ? 'border-primary bg-primary/10 text-foreground font-medium shadow-xs shadow-primary/15 ring-1 ring-primary/40'
                                  : 'border-border/70 bg-card hover:bg-muted/60 hover:border-border text-foreground/85 hover:text-foreground'
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <NodeIcon
                                  icon={nodeData?.icon}
                                  name={nodeName}
                                  isSelected={isSelected}
                                />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span
                                    className="text-xs font-medium break-words [overflow-wrap:anywhere] leading-snug"
                                    title={nodeName}
                                  >
                                    <EmojiText text={nodeName} />
                                  </span>
                                  <span className="text-[10px] font-mono text-muted-foreground uppercase mt-0.5">
                                    {nodeType}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {renderDelayBadge(delay)}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="empty-state py-6">{t(!running && nodes.length === 0 ? 'noCachedNodes' : 'noProxyNodesMatchYourSearch')}</p>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
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
