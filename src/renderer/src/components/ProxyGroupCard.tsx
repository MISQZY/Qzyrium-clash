import type { ProxyGroup, ProxyNode } from '@shared/mihomo'
import { useTranslations } from '../i18n'
import { ChevronDown } from 'lucide-react'
import { LatencyIcon } from '../lib/icons'
import { sortProxyNodes, type ProxySortMode } from '../lib/proxies'
import { cn } from '../lib/utils'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { EmojiText } from './EmojiText'
import { GroupIcon, NodeIcon, getGroupTypeStyle } from './ProxyIcons'
import { DelayBadge } from './DelayBadge'

interface Props {
  groupName: string; group: ProxyGroup; proxies: Record<string, ProxyNode>; delays: Record<string, number>
  isExpanded: boolean; trimmedQuery: string; sortMode: ProxySortMode; running: boolean
  testingGroup: string | null; testingAll: boolean; testingNodes: ReadonlySet<string>
  onToggle: (name: string) => void
  onTest: (name: string, nodes: string[]) => Promise<void>
  onSelect: (group: string, node: string) => void
}

export function ProxyGroupCard({ groupName, group, proxies, delays, isExpanded, trimmedQuery, sortMode,
  running, testingGroup, testingAll, testingNodes, onToggle, onTest, onSelect }: Props) {
  const t = useTranslations('proxies')

              const nodes = group?.all || []
  const activeNow = group?.now || ''
              const isGroupTesting = testingGroup === groupName

  const matchingNodes = trimmedQuery
    ? nodes.filter(
        (n) =>
          n.toLowerCase().includes(trimmedQuery) ||
          groupName.toLowerCase().includes(trimmedQuery)
      )
    : nodes

  const sortedNodes = sortProxyNodes(matchingNodes, sortMode, proxies, delays)
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
        onClick={() => onToggle(groupName)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle(groupName)
          }
        }}
        className="flex items-center justify-between gap-3 p-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
      >
        {/* Left: Group identity & active selection */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <GroupIcon icon={group?.icon} name={groupName} />

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground truncate">
                <EmojiText text={groupName} />
              </span>
              <span
                className={cn(
                  'text-xs font-mono shrink-0',
                  typeMeta.className
                )}
              >
                {typeMeta.label}
              </span>
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
              onTest(groupName, nodes)
            }}
            className={cn('h-8 px-2.5 text-xs gap-1.5 border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
              (isGroupTesting || testingAll) && 'latency-testing-button')}
            aria-busy={isGroupTesting || testingAll}
            title={t('testGroup')}
          >
            <LatencyIcon
              className="size-4 text-muted-foreground"
            />
            <span className="hidden sm:grid whitespace-nowrap">
              <span className={cn('col-start-1 row-start-1', (isGroupTesting || testingAll) && 'invisible')} aria-hidden={isGroupTesting || testingAll}>
                {t('testGroup')}
              </span>
              <span className={cn('col-start-1 row-start-1', !(isGroupTesting || testingAll) && 'invisible')} aria-hidden={!(isGroupTesting || testingAll)}>
                {t('testing')}
              </span>
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
        <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-background/30">
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
                    onClick={() => onSelect(groupName, nodeName)}
                    className={cn(
                      'relative flex items-center justify-between gap-2.5 p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_54px]',
                      isSelected
                        ? 'border-border bg-muted text-foreground font-medium'
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
                        <span className="text-[11px] font-mono text-muted-foreground uppercase mt-0.5">
                          {nodeType}
                        </span>
                      </div>
                    </div>

                    <div className="flex w-24 items-center justify-center shrink-0 whitespace-nowrap">
                      <DelayBadge delay={delay} loading={testingNodes.has(nodeName)} />
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

}
