import { ProcessIcon } from '../ProcessIcon'

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
}

export function ProcessGroupHero({ group: activeProcessGroup, actions }: ProcessGroupHeroProps) {
  const t = useTranslations('connections')
  const { closing, closeProcessConnections } = actions
  return (
<Card className="p-4 rounded-xl border border-border/70 bg-card/60 backdrop-blur-xs flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/25 overflow-hidden p-1.5">
                  <ProcessIcon
                    processPath={activeProcessGroup.path}
                    processName={activeProcessGroup.name}
                    className="size-6"
                    fallbackClassName="size-5.5"
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-foreground truncate">
                      {activeProcessGroup.name}
                    </h3>
                    <Badge className="min-w-5 h-5 justify-center px-1.5 leading-none text-[11px] font-semibold bg-primary text-primary-foreground border-0 rounded-full">
                      {t('sessions', { count: activeProcessGroup.connections.length })}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs font-mono">
                    <TrafficValue key={`${activeProcessGroup.key}-download`} value={activeProcessGroup.totalDownload} direction="download" />
                    <TrafficValue key={`${activeProcessGroup.key}-upload`} value={activeProcessGroup.totalUpload} direction="upload" />
                  </div>
                </div>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => closeProcessConnections(activeProcessGroup)}
                disabled={closing || !activeProcessGroup.connections.length}
                className="gap-1.5 text-xs shrink-0 self-start sm:self-center"
              >
                <DisconnectIcon className="size-3.5" />
                <span>{t('closeProcessConnections')}</span>
              </Button>
            </div>
          </Card>
  )
}
