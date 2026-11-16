import { useRef, useState } from 'react'
import { CircleCheck, CircleHelp, CircleX, Globe, Loader2, ShieldAlert } from 'lucide-react'
import { Tooltip } from 'radix-ui'
import { type ServiceCheckTarget, type ServiceCheckResult } from '@shared/service-check'
import { useTranslations } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { cn } from '../../lib/utils'
import { EmojiText } from '../EmojiText'
import { countryFlag } from '../../lib/emoji'
import { ScrollArea } from '../ui/scroll-area'

export function ServiceCheckDialog({ nodeName, targets, onClose }: { nodeName: string; targets: ServiceCheckTarget[]; onClose: () => void }) {
  const t = useTranslations('proxies')
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<ServiceCheckResult[]>([])
  const [error, setError] = useState(false)
  const inFlight = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const check = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setTesting(true)
    setResults([])
    setError(false)
    try {
      setResults(await window.api.mihomo.checkServices(nodeName))
    } catch {
      setError(true)
    } finally {
      inFlight.current = false
      setTesting(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg overflow-hidden grid-rows-[auto_minmax(0,1fr)_auto]"
        onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus() }}>
        <DialogHeader>
          <div className="flex items-center gap-2 pr-6">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">{t('checkServices')}</DialogTitle>
            <Tooltip.Provider delayDuration={150}><Tooltip.Root>
              <Tooltip.Trigger asChild><button type="button" aria-label={t('serviceCheckHelp')}
                className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <CircleHelp className="size-3.5" />
              </button></Tooltip.Trigger>
              <Tooltip.Portal><Tooltip.Content side="bottom" sideOffset={6} className="sidebar-tooltip z-[60] max-w-80 text-xs leading-relaxed">
                {t('serviceCheckHint')}<Tooltip.Arrow className="fill-popover" />
              </Tooltip.Content></Tooltip.Portal>
            </Tooltip.Root></Tooltip.Provider>
          </div>
          <DialogDescription className="wrap-anywhere leading-relaxed"><EmojiText text={nodeName} /></DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 max-h-[50vh] pr-3" style={{ height: Math.min(420, Math.max(80, targets.length * 76 - 8)) }} data-service-check-list>
        <div className="flex flex-col gap-2" aria-live="polite" aria-busy={testing}>
          {targets.length === 0 && <p className="py-3 text-xs text-muted-foreground">{t('noServiceCheckTargets')}</p>}
          {targets.map(target => {
            const result = results.find(item => item.id === target.id)
            const StatusIcon = result?.status === 'available' ? CircleCheck
              : result?.status === 'blocked' || result?.status === 'unreachable' ? CircleX
                : result?.status === 'challenged' || result?.status === 'restricted' || result?.status === 'rejected' ? ShieldAlert : CircleHelp
            return (
              <div key={target.id} data-service-check-row className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 p-3 text-xs">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground"><Globe className="size-4" /></div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium wrap-anywhere"><EmojiText text={target.name} /></span>
                  <span className="text-[11px] text-muted-foreground">{t(target.kind === 'regional' ? 'serviceKindRegional' : target.kind === 'content' ? 'serviceKindContent' : 'serviceKindHttp')}</span>
                  {result?.region && <span className="flex items-center gap-1 text-muted-foreground"><EmojiText text={countryFlag(result.region)} />{result.region}</span>}
                </div>
                <div className={cn('flex max-w-[50%] shrink-0 flex-col items-end gap-1 text-right text-muted-foreground',
                  result?.status === 'available' && 'text-success',
                  ['rejected', 'challenged', 'restricted'].includes(result?.status ?? '') && 'text-warning',
                  ['unreachable', 'blocked'].includes(result?.status ?? '') && 'text-destructive')}>
                  <span className="flex items-center justify-end gap-1.5">
                    {testing ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : result && <StatusIcon className="size-3.5 shrink-0" />}
                    {testing ? t('testing') : result ? t(result.status === 'available' && target.kind !== 'http' && target.kind ? 'serviceAvailable' : `serviceStatus_${result.status}`) : '—'}
                  </span>
                  {result && <span className="flex flex-wrap justify-end gap-x-2 font-mono text-[11px] text-muted-foreground">
                    {result.httpStatus !== undefined && <span>{t('serviceHttpStatus', { status: result.httpStatus })}</span>}
                    {result.delay !== undefined && <span>{t('latency', { delay: result.delay })}</span>}
                  </span>}
                </div>
              </div>
            )
          })}
        </div>
        </ScrollArea>
        <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
          {error && <p role="alert" className="text-xs text-destructive">{t('serviceCheckFailed')}</p>}
          <div className="flex justify-end">
          <Button size="sm" disabled={testing || targets.length === 0} onClick={check}>
            {testing ? t('testing') : t('checkServices')}
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
