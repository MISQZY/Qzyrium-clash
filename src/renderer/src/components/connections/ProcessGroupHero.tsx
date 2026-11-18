import { ProcessIcon } from '../ProcessIcon'
import { ShieldPlus } from 'lucide-react'

import { useTranslations } from '../../i18n'

import { DisconnectIcon } from '../../lib/icons'

import { Button } from '../ui/button'

import { Card } from '../ui/card'
import { Badge } from '../ui/badge'

import { TrafficValue } from '../TrafficValue'
import type { ConnectionActions } from '../../hooks/useConnectionActions'
import type { ProcessGroup } from '../../lib/connections'

interface ProcessGroupHeroProps {
  group: ProcessGroup
  actions: Pick<ConnectionActions, 'closing' | 'closeProcessConnections'>
  onQuickRule?: (group: ProcessGroup) => void
}

export function ProcessGroupHero({ group: activeProcessGroup, actions, onQuickRule }: ProcessGroupHeroProps) {
  const t = useTranslations('connections')
  const { closing, closeProcessConnections } = actions
  return (
    <Card className="p-3 sm:p-3.5 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/25 overflow-hidden p-1.5">
            <ProcessIcon
              processPath={activeProcessGroup.path}
              processName={activeProcessGroup.name}
              className="size-5.5"
              fallbackClassName="size-5"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                {activeProcessGroup.name}
              </h3>
              <Badge className="min-w-5 h-5 justify-center px-1.5 leading-none text-[11px] font-semibold bg-primary text-primary-foreground border-0 rounded-full shrink-0">
                {t('sessions', { count: activeProcessGroup.connections.length })}
              </Badge>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5 text-xs font-mono">
              <TrafficValue key={`${activeProcessGroup.key}-download`} value={activeProcessGroup.totalDownload} direction="download" />
              <TrafficValue key={`${activeProcessGroup.key}-upload`} value={activeProcessGroup.totalUpload} direction="upload" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center flex-wrap sm:flex-nowrap">
          {onQuickRule && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onQuickRule(activeProcessGroup)}
              disabled={!activeProcessGroup.path && !activeProcessGroup.connections.some((item) => item.metadata.process)}
              className="gap-1.5 text-xs h-8 px-2.5 shrink-0"
            >
              <ShieldPlus className="size-3.5" />
              <span>{t('createRule')}</span>
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => closeProcessConnections(activeProcessGroup)}
            disabled={closing || !activeProcessGroup.connections.length}
            className="gap-1.5 text-xs h-8 px-2.5 shrink-0"
          >
            <DisconnectIcon className="size-3.5" />
            <span>{t('closeProcessConnections')}</span>
          </Button>
        </div>
      </div>
    </Card>
  )
}
