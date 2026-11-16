import { useTranslations } from '../i18n'
import { ArrowDown, ArrowUp, ShieldPlus } from 'lucide-react'
import { DisconnectIcon } from '../lib/icons'
import type { ConnectionItem } from '@shared/mihomo'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { TrafficValue } from './TrafficValue'
import { ProcessIcon } from './ProcessIcon'
import { getProcessDisplayName, getNetworkBadgeClass } from '../lib/connections'
import { ConnectionDestinationSection } from './connection-details/ConnectionDestinationSection'
import { ConnectionSourceSection } from './connection-details/ConnectionSourceSection'
import { ConnectionApplicationSection } from './connection-details/ConnectionApplicationSection'
import { ConnectionRouteSection } from './connection-details/ConnectionRouteSection'
import { ConnectionMetadataSection } from './connection-details/ConnectionMetadataSection'

export function ConnectionDetailsDialog({ activeDetail, setSelectedConnection, handleCopy, copiedKey, closing, close, onQuickRule }: {
  activeDetail: ConnectionItem | null
  setSelectedConnection: (item: ConnectionItem | null) => void
  handleCopy: (text: string, key: string) => Promise<void>
  copiedKey: string | null
  closing: boolean
  close: (id?: string) => Promise<void>
  onQuickRule?: (item: ConnectionItem) => void
}) {
  const t = useTranslations('connections')
  const common = useTranslations('common')

  const procName = activeDetail
    ? getProcessDisplayName(activeDetail.metadata.processPath, activeDetail.metadata.process, t('system'))
    : ''

  return (
    <Dialog open={Boolean(activeDetail)} onOpenChange={(open) => !open && setSelectedConnection(null)}>
      {activeDetail && (
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-5 pb-4 border-b border-border/60 bg-muted/20">
            <div className="flex items-center justify-between gap-3 pr-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 border border-primary/25 overflow-hidden p-1">
                  <ProcessIcon
                    processPath={activeDetail.metadata.processPath}
                    processName={procName}
                    className="size-6"
                    fallbackClassName="size-5"
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <DialogTitle className="text-base font-semibold truncate flex items-center gap-2">
                    <span>{procName}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] uppercase px-1.5 py-0 ${getNetworkBadgeClass(activeDetail.metadata.network)}`}
                    >
                      {activeDetail.metadata.network}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                    {activeDetail.metadata.host || activeDetail.metadata.destinationIP}:
                    {activeDetail.metadata.destinationPort}
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[68vh] p-5">
            <div className="flex flex-col gap-4">
              {/* Traffic Stats Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <ArrowDown className="size-3 text-muted-foreground" />
                    {t('transfer')}
                  </span>
                  <TrafficValue key={`${activeDetail.id}-download`} value={activeDetail.download} direction="download" showIcon={false} className="font-mono text-base font-bold" />
                </div>

                <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-muted/20 border border-border/50">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <ArrowUp className="size-3 text-muted-foreground" />
                    {t('transfer')}
                  </span>
                  <TrafficValue key={`${activeDetail.id}-upload`} value={activeDetail.upload} direction="upload" showIcon={false} className="font-mono text-base font-bold" />
                </div>
              </div>

              {/* Destination Section */}
              <ConnectionDestinationSection metadata={activeDetail.metadata} />

              {/* Source & Inbound Section */}
              <ConnectionSourceSection metadata={activeDetail.metadata} />

              {/* Application Section */}
              <ConnectionApplicationSection metadata={activeDetail.metadata} />

              {/* Routing & Proxy Chain Section */}
              <ConnectionRouteSection
                connection={activeDetail}
                handleCopy={handleCopy}
                copiedKey={copiedKey}
              />

              {/* System & Metadata Section */}
              <ConnectionMetadataSection connection={activeDetail} />
            </div>
          </ScrollArea>

          <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex flex-row items-center justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => close(activeDetail.id)}
              disabled={closing}
              className="gap-1.5 text-xs"
            >
              <DisconnectIcon className="size-3.5" />
              <span>{t('closeConnection')}</span>
            </Button>
            <div className="flex items-center gap-2">
              {onQuickRule && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onQuickRule(activeDetail)}
                  className="gap-1.5 text-xs"
                >
                  <ShieldPlus className="size-3.5 text-primary" />
                  <span>{t('createRule')}</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedConnection(null)}
                className="text-xs"
              >
                {common('close')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
