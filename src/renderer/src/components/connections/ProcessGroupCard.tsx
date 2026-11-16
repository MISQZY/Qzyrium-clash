import { ProcessIcon } from '../ProcessIcon'

import { useTranslations } from '../../i18n'

import { ChevronRight, ShieldPlus } from 'lucide-react'
import { DisconnectIcon } from '../../lib/icons'

import { Card } from '../ui/card'
import { Badge } from '../ui/badge'

import { TrafficValue } from '../TrafficValue'

import type { ProcessGroup } from '../../lib/connections'

interface ProcessGroupCardProps {
  group: ProcessGroup
  onSelect: (key: string) => void
  onClose?: (group: ProcessGroup) => void
  onQuickRule?: (group: ProcessGroup) => void
  closing?: boolean
}

export function ProcessGroupCard({ group, onSelect, onClose, onQuickRule, closing }: ProcessGroupCardProps) {
  const t = useTranslations('connections')

  return (
    <Card
      key={group.key}
      onClick={() => onSelect(group.key)}
      className="group relative cursor-pointer border border-border/70 bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors p-3.5 shadow-none rounded-xl"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Process icon & Details */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 overflow-hidden p-1.5">
            <ProcessIcon
              processPath={group.path}
              processName={group.name}
              className="size-5.5"
              fallbackClassName="size-5"
            />
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {group.name}
              </span>
              <Badge className="min-w-5 h-5 justify-center px-1.5 leading-none text-[11px] font-semibold bg-primary text-primary-foreground border-0 rounded-full">
                {group.activeCount}
              </Badge>
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground truncate">
              <span className="font-mono text-[11px] truncate text-muted-foreground/80">
                {group.path || group.name}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Traffic totals & Actions */}
        <div className="flex items-center shrink-0 pl-2 pr-1">
          <div className="mr-3 flex flex-col items-end text-right font-mono text-[11px] leading-tight">
            <TrafficValue value={group.totalDownload} direction="download" />
            <TrafficValue value={group.totalUpload} direction="upload" className="mt-0.5" />
          </div>

          <div className="flex items-center gap-0.5 max-w-0 overflow-hidden opacity-0 pointer-events-none transition-[max-width,opacity,margin] group-hover:max-w-16 group-hover:mr-2 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:max-w-16 group-focus-within:mr-2 group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:max-w-16 [@media(hover:none)]:mr-2 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
          {onQuickRule && (
            <button type="button" aria-label={t('createRule')} title={t('createRule')}
              disabled={!group.path && !group.connections.some((item) => item.metadata.process)}
              onClick={(event) => { event.stopPropagation(); onQuickRule(group) }}
              className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer disabled:opacity-50 disabled:cursor-default">
              <ShieldPlus className="size-4" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              aria-label={t('closeProcessConnections')}
              title={t('closeProcessConnections')}
              disabled={closing || !group.connections.length}
              onClick={(e) => {
                e.stopPropagation()
                onClose(group)
              }}
              className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-50"
            >
              <DisconnectIcon className="size-4" />
            </button>
          )}
          </div>

          <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </Card>
  )
}
