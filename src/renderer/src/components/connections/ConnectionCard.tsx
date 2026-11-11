import { ProcessIcon } from '../ProcessIcon'

import { extractProcessName, formatChain } from '../../lib/connections'
import { useTranslations } from '../../i18n'

import { Copy, Check, Clock } from 'lucide-react'
import { DisconnectIcon } from '../../lib/icons'
import type { ConnectionItem } from '@shared/mihomo'

import { Button } from '../ui/button'

import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { formatDuration } from '../../lib/format'
import { EmojiText } from '../EmojiText'
import { TrafficValue } from '../TrafficValue'
import type { ConnectionActions } from '../../hooks/useConnectionActions'

interface ConnectionCardProps {
  item: ConnectionItem
  actions: Pick<ConnectionActions, 'setSelectedConnection' | 'handleCopy' | 'copiedKey' | 'closing' | 'close'>
}

export function ConnectionCard({ item, actions }: ConnectionCardProps) {
  const t = useTranslations('connections')
  const { setSelectedConnection, handleCopy, copiedKey, closing, close } = actions

    const procName = extractProcessName(item.metadata.processPath) || item.metadata.process || t('system')
    const isUdp = item.metadata.network.toLowerCase() === 'udp'
    const duration = formatDuration(Math.max(0, Date.now() - new Date(item.start).getTime()))
    const hostOrIp = item.metadata.host || item.metadata.destinationIP || t('unknownHost')
    const fullDestination = `${hostOrIp}${item.metadata.destinationPort ? `:${item.metadata.destinationPort}` : ''}`

    
  return (
(
      <Card
        key={item.id}
        onClick={() => setSelectedConnection(item)}
        className="group relative cursor-pointer border border-border/70 bg-card hover:bg-muted/30 hover:border-primary/40 transition-colors p-3 shadow-none rounded-xl [content-visibility:auto] [contain-intrinsic-size:auto_72px]"
      >
        <div className="flex items-center justify-between gap-3">
          {/* Left: Process icon & Details */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 group-hover:scale-105 transition-transform overflow-hidden p-1">
              <ProcessIcon
                processPath={item.metadata.processPath}
                processName={procName}
                className="size-5"
                fallbackClassName="size-4.5"
              />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              {/* Top line: Process name, Protocol Badge, Rule Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground truncate max-w-[180px] sm:max-w-[260px]">
                  {procName}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono px-1.5 py-0 uppercase border ${
                    isUdp
                      ? 'border-warning/40 text-warning bg-warning/10'
                      : 'border-primary/40 text-primary bg-primary/10'
                  }`}
                >
                  {item.metadata.network}
                </Badge>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                  {item.rule}
                </Badge>
              </div>

              {/* Bottom line: Code-style destination chip with embedded copy button */}
              <div className="flex items-center gap-2 mt-1 min-w-0 flex-wrap">
                <div
                  className="group/codechip inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border/60 bg-muted/40 dark:bg-zinc-950/40 font-mono text-[11px] text-foreground/90 max-w-[260px] sm:max-w-[360px] hover:border-primary/40 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy(fullDestination, `host-${item.id}`)
                  }}
                  title={fullDestination}
                >
                  <span className="truncate font-mono">
                    <EmojiText text={hostOrIp} />
                    {item.metadata.destinationPort ? `:${item.metadata.destinationPort}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy(fullDestination, `host-${item.id}`)
                    }}
                    title={copiedKey === `host-${item.id}` ? t('copied') : t('copy')}
                    aria-label={copiedKey === `host-${item.id}` ? t('copied') : t('copy')}
                    className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-background/80 transition-colors"
                  >
                    {copiedKey === `host-${item.id}` ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3 opacity-60 group-hover/codechip:opacity-100" />
                    )}
                  </button>
                </div>

                <span className="text-border text-xs hidden sm:inline">•</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  <EmojiText text={formatChain(item.chains)} />
                </span>
              </div>
            </div>
          </div>

          {/* Right: Traffic, Duration & Disconnect Action */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col items-end text-right font-mono text-[11px] leading-tight">
              <TrafficValue value={item.download} direction="download" />
              <TrafficValue value={item.upload} direction="upload" className="mt-0.5" />
            </div>

            <div className="hidden sm:flex flex-col items-end text-right text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="size-2.5" />
                {duration}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('closeConnection')}
              disabled={closing}
              onClick={(e) => {
                e.stopPropagation()
                close(item.id)
              }}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <DisconnectIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    )
  )
}
