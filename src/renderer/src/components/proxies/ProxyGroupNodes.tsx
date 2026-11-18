import { memo, useMemo } from 'react'
import { Globe } from 'lucide-react'
import { canCheckProxyServices } from '@shared/service-check'
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
  onlyAvailable, running, testingNodes, onSelect, onCheckServices }: {
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
  onCheckServices?: (node: string) => void
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
              loading={testingNodes.has(nodeName)} onSelect={onSelect}
              canCheck={canCheckProxyServices(proxies[nodeName])} onCheckServices={onCheckServices} />
          }} />
      ) : (
        <p className="empty-state py-6">{t(!running && nodes.length === 0 ? 'noCachedNodes' : 'noProxyNodesMatchYourSearch')}</p>
      )}
    </div>
  )
}

const ProxyNodeCard = memo(function ProxyNodeCard({ nodeName, nodeData, selected, groupName, delay, loading, onSelect, canCheck, onCheckServices }: {
  nodeName: string
  nodeData?: ProxyNode
  selected: boolean
  groupName: string
  delay?: number
  loading: boolean
  onSelect: (group: string, node: string) => void
  canCheck: boolean
  onCheckServices?: (node: string) => void
}) {
  const t = useTranslations('proxies')
  const nodeType = nodeData?.type || 'direct'

  return (
    <div className={cn('relative rounded-lg border transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_54px]',
      selected ? 'border-primary bg-primary/10 shadow-xs shadow-primary/15 ring-1 ring-primary/40'
        : 'border-border/70 bg-card hover:bg-muted/60 hover:border-border')}>
    <button
      key={nodeName}
      type="button"
      role="button"
      tabIndex={0}
      aria-label={t('selectNode', { name: nodeName })}
      aria-pressed={selected}
      onClick={() => onSelect(groupName, nodeName)}
      className={cn(
        'flex w-full min-w-0 items-center justify-between gap-2.5 rounded-lg p-2.5 text-left text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        onCheckServices && canCheckProxyServices(nodeData) && 'pr-10',
        selected ? 'text-foreground font-medium' : 'text-foreground/85 hover:text-foreground'
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

      <div className="flex w-24 items-center justify-end shrink-0 whitespace-nowrap">
        <DelayBadge delay={delay} loading={loading} />
      </div>
    </button>
    {onCheckServices && canCheckProxyServices(nodeData) && <button type="button"
      disabled={!canCheck} onClick={() => onCheckServices(nodeName)}
      className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
      title={t('checkNodeServices', { name: nodeName })} aria-label={t('checkNodeServices', { name: nodeName })}>
      <Globe className="size-3.5" />
    </button>}
    </div>
  )
})
