import { memo, useMemo } from 'react'
import type { ProxyNode } from '@shared/mihomo'
import { useTranslations } from '../../i18n'
import { sortProxyNodes, type ProxySortMode } from '../../lib/proxies'
import { cn } from '../../lib/utils'
import { NodeIcon } from '../ProxyIcons'
import { EmojiText } from '../EmojiText'
import { DelayBadge } from '../DelayBadge'
import { VirtualList } from '../VirtualList'

const EMPTY_DELAYS: Record<string, number> = {}

export function ProxyGroupNodes({ groupName, nodes, activeNow, proxies, delays, trimmedQuery, sortMode,
  onlyAvailable, running, testingNodes, onSelect }: {
  groupName: string
  nodes: string[]
  activeNow: string
  proxies: Record<string, ProxyNode>
  delays: Record<string, number>
  trimmedQuery: string
  sortMode: ProxySortMode
  onlyAvailable?: boolean
  running: boolean
  testingNodes: ReadonlySet<string>
  onSelect: (group: string, node: string) => void
}) {
  const t = useTranslations('proxies')
  // Default/name ordering does not depend on latency unless availability is filtered.
  const sortingDelays = sortMode === 'latency' || onlyAvailable ? delays : EMPTY_DELAYS
  const sortedNodes = useMemo(() => {
    const matchingNodes = nodes.filter((n) => {
      if (
        trimmedQuery &&
        !n.toLowerCase().includes(trimmedQuery) &&
        !groupName.toLowerCase().includes(trimmedQuery)
      ) {
        return false
      }
      if (onlyAvailable) {
        const nodeData = proxies[n]
        const delay = sortingDelays[n] ?? nodeData?.history?.[nodeData?.history?.length - 1]?.delay
        return delay !== undefined && delay > 0
      }
      return true
    })

    return sortProxyNodes(matchingNodes, sortMode, proxies, sortingDelays)
  }, [nodes, trimmedQuery, groupName, onlyAvailable, proxies, sortMode, sortingDelays])

  return (
    <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-background/30">
      {sortedNodes.length > 0 ? (
        <VirtualList data={sortedNodes} itemKey={name => name} twoColumns className="pt-3" renderItem={(nodeName) => {
            return <ProxyNodeCard nodeName={nodeName} nodeData={proxies[nodeName]}
              selected={activeNow === nodeName} groupName={groupName}
              delay={delays[nodeName] ?? proxies[nodeName]?.history?.[proxies[nodeName].history.length - 1]?.delay}
              loading={testingNodes.has(nodeName)} onSelect={onSelect} />
          }} />
      ) : (
        <p className="empty-state py-6">{t(!running && nodes.length === 0 ? 'noCachedNodes' : 'noProxyNodesMatchYourSearch')}</p>
      )}
    </div>
  )
}

const ProxyNodeCard = memo(function ProxyNodeCard({ nodeName, nodeData, selected, groupName, delay, loading, onSelect }: {
  nodeName: string
  nodeData?: ProxyNode
  selected: boolean
  groupName: string
  delay?: number
  loading: boolean
  onSelect: (group: string, node: string) => void
}) {
  const t = useTranslations('proxies')
  const nodeType = nodeData?.type || 'direct'

  return (
    <button
      key={nodeName}
      type="button"
      role="button"
      tabIndex={0}
      aria-label={t('selectNode', { name: nodeName })}
      aria-pressed={selected}
      onClick={() => onSelect(groupName, nodeName)}
      className={cn(
        'relative flex items-center justify-between gap-2.5 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_54px]',
        selected
          ? 'border-primary bg-primary/10 text-foreground font-medium shadow-xs shadow-primary/15 ring-1 ring-primary/40'
          : 'border-border/70 bg-card hover:bg-muted/60 hover:border-border text-foreground/85 hover:text-foreground'
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <NodeIcon
          icon={nodeData?.icon}
          name={nodeName}
        />
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="text-xs font-medium wrap-anywhere leading-snug"
            title={nodeName}
          >
            <EmojiText text={nodeName} />
          </span>
          <span className="text-[11px] font-mono text-muted-foreground uppercase mt-0.5">
            {nodeType}
          </span>
        </div>
      </div>

      <div className="flex w-24 items-center justify-center shrink-0 whitespace-nowrap">
        <DelayBadge delay={delay} loading={loading} />
      </div>
    </button>
  )
})
