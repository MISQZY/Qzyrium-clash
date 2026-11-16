import type { ProxyGroup, ProxyNode } from '@shared/mihomo'
import { useTranslations } from '../i18n'
import { ChevronDown } from 'lucide-react'
import { LatencyIcon } from '../lib/icons'
import type { ProxySortMode } from '../lib/proxies'
import { cn } from '../lib/utils'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { EmojiText } from './EmojiText'
import { GroupIcon, getGroupTypeStyle } from './ProxyIcons'
import { ProxyGroupNodes } from './proxies/ProxyGroupNodes'

interface Props {
  groupName: string; group: ProxyGroup; proxies: Record<string, ProxyNode>; delays: Record<string, number>
  isExpanded: boolean; trimmedQuery: string; sortMode: ProxySortMode; running: boolean
  testingGroups: ReadonlySet<string>; testingAll: boolean; testingNodes: ReadonlySet<string>
  onlyAvailable?: boolean
  onToggle: (name: string) => void
  onTest: (name: string, nodes: string[]) => Promise<void>
  onSelect: (group: string, node: string) => void
}

export function ProxyGroupCard({ groupName, group, proxies, delays, isExpanded, trimmedQuery, sortMode,
  running, testingGroups, testingAll, testingNodes, onlyAvailable, onToggle, onTest, onSelect }: Props) {
  const t = useTranslations('proxies')

  const nodes = group?.all || []
  const activeNow = group?.now || ''
  const isGroupTesting = testingGroups.has(groupName)

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
        <ProxyGroupNodes groupName={groupName} nodes={nodes} activeNow={activeNow}
          proxies={proxies} delays={delays} trimmedQuery={trimmedQuery} sortMode={sortMode}
          onlyAvailable={onlyAvailable} running={running} testingNodes={testingNodes} onSelect={onSelect} />
      )}
    </Card>
  )

}
