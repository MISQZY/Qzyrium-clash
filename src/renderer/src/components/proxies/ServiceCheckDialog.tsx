import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  CircleCheck,
  CircleHelp,
  CircleX,
  Film,
  Globe,
  Loader2,
  MessageSquare,
  Music,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Youtube
} from 'lucide-react'
import { Tooltip } from 'radix-ui'
import {
  type ServiceCheckTarget,
  type ServiceCheckResult,
  REMNAWAVE_GEOCHECK_TARGETS
} from '@shared/service-check'
import { useTranslations } from '../../i18n'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { cn } from '../../lib/utils'
import { EmojiText } from '../EmojiText'
import { countryFlag } from '../../lib/emoji'
import { ScrollArea } from '../ui/scroll-area'

export function ServiceCheckDialog({
  nodeName,
  targets,
  onClose
}: {
  nodeName: string
  targets: ServiceCheckTarget[]
  onClose: () => void
}) {
  const t = useTranslations('proxies')
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<ServiceCheckResult[]>([])
  const [error, setError] = useState(false)
  const [activeTab, setActiveTab] = useState<'geocheck' | 'endpoints'>('geocheck')
  const inFlight = useRef(false)
  const isMounted = useRef(true)
  const titleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  const check = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setTesting(true)
    setResults([])
    setError(false)
    try {
      const combinedTargets = [
        ...REMNAWAVE_GEOCHECK_TARGETS,
        ...targets.filter(t => !REMNAWAVE_GEOCHECK_TARGETS.some(g => g.id === t.id))
      ]
      const data = await window.api.mihomo.checkServices(nodeName, combinedTargets)
      if (isMounted.current) setResults(data)
    } catch {
      if (isMounted.current) setError(true)
    } finally {
      inFlight.current = false
      if (isMounted.current) setTesting(false)
    }
  }

  const ipInfo = results.find(r => r.ipInfo)?.ipInfo

  const getServiceIcon = (preset?: string, id?: string) => {
    const key = (preset || id || '').toLowerCase()
    if (key.includes('netflix')) return <Film className="size-4 text-red-500" />
    if (key.includes('youtube')) return <Youtube className="size-4 text-red-500" />
    if (key.includes('chatgpt')) return <Bot className="size-4 text-emerald-500" />
    if (key.includes('gemini')) return <Sparkles className="size-4 text-blue-400" />
    if (key.includes('claude')) return <Bot className="size-4 text-amber-500" />
    if (key.includes('google-search') || key === 'google') return <Search className="size-4 text-primary" />
    if (key.includes('tiktok') || key.includes('spotify')) return <Music className="size-4 text-pink-500" />
    if (key.includes('disney')) return <Film className="size-4 text-blue-500" />
    if (key.includes('telegram')) return <MessageSquare className="size-4 text-sky-400" />
    return <Globe className="size-4 text-muted-foreground" />
  }

  const renderStatusBadge = (target: ServiceCheckTarget, result?: ServiceCheckResult) => {
    if (testing) {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 shrink-0 animate-spin" />
          {t('testing')}
        </span>
      )
    }
    if (!result) return <span className="text-xs text-muted-foreground">—</span>

    // Netflix specific
    if (target.preset === 'netflix') {
      if (result.details === 'full' || (result.status === 'available' && !result.details)) {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
            <CircleCheck className="size-3 shrink-0" />
            {t('geocheckNetflixFull')}
          </span>
        )
      }
      if (result.status === 'restricted' || result.details === 'originals') {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
            <ShieldAlert className="size-3 shrink-0" />
            {t('geocheckNetflixOriginals')}
          </span>
        )
      }
      if (result.status === 'blocked') {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <CircleX className="size-3 shrink-0" />
            {t('serviceStatus_blocked')}
          </span>
        )
      }
    }

    // Google Search specific
    if (target.preset === 'google-search') {
      if (result.details === 'clean' || (result.status === 'available' && !result.details)) {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
            <CircleCheck className="size-3 shrink-0" />
            {t('geocheckGoogleClean')}
          </span>
        )
      }
      if (result.status === 'challenged' || result.details === 'captcha') {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
            <ShieldAlert className="size-3 shrink-0" />
            {t('geocheckGoogleCaptcha')}
          </span>
        )
      }
    }

    // ChatGPT specific
    if (target.preset === 'chatgpt') {
      if (result.status === 'available') {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
            <CircleCheck className="size-3 shrink-0" />
            {t('geocheckChatGptAvailable')}
          </span>
        )
      }
      if (result.status === 'challenged') {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
            <ShieldAlert className="size-3 shrink-0" />
            {t('serviceStatus_challenged')}
          </span>
        )
      }
      if (result.status === 'blocked') {
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <CircleX className="size-3 shrink-0" />
            {t('serviceStatus_blocked')}
          </span>
        )
      }
    }

    // General status verdicts
    const text =
      result.status === 'available' && target.kind !== 'http' && target.kind
        ? t('serviceAvailable')
        : t(`serviceStatus_${result.status}`)
    const isSuccess = result.status === 'available'
    const isWarning = ['rejected', 'challenged', 'restricted'].includes(result.status)
    const isDestructive = ['unreachable', 'blocked'].includes(result.status)

    const Icon = isSuccess ? CircleCheck : isDestructive ? CircleX : isWarning ? ShieldAlert : CircleHelp

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium',
          isSuccess && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500',
          isWarning && 'border-amber-500/25 bg-amber-500/10 text-amber-500',
          isDestructive && 'border-destructive/25 bg-destructive/10 text-destructive',
          !isSuccess && !isWarning && !isDestructive && 'border-border/60 bg-muted/40 text-muted-foreground'
        )}
      >
        <Icon className="size-3 shrink-0" />
        {text}
      </span>
    )
  }

  const renderRow = (target: ServiceCheckTarget, isConfiguredTarget: boolean) => {
    const result = results.find(item => item.id === target.id)
    return (
      <div
        key={target.id}
        {...(isConfiguredTarget ? { 'data-service-check-row': true } : { 'data-geocheck-row': true })}
        className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/50 p-3 text-xs transition-colors hover:bg-muted/30"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          {getServiceIcon(target.preset, target.id)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium wrap-anywhere">
            <EmojiText text={target.name} />
          </span>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              {t(
                target.kind === 'regional'
                  ? 'serviceKindRegional'
                  : target.kind === 'content'
                    ? 'serviceKindContent'
                    : 'serviceKindHttp'
              )}
            </span>
            {result?.region && (
              <span className="flex items-center gap-1 font-medium text-foreground/80">
                <EmojiText text={countryFlag(result.region)} />
                {result.region}
              </span>
            )}
          </div>
        </div>
        <div className="flex max-w-[50%] shrink-0 flex-col items-end gap-1 text-right">
          {renderStatusBadge(target, result)}
          {result && (
            <span className="flex flex-wrap justify-end gap-x-2 font-mono text-[11px] text-muted-foreground">
              {result.httpStatus !== undefined && (
                <span>{t('serviceHttpStatus', { status: result.httpStatus })}</span>
              )}
              {result.delay !== undefined && <span>{t('latency', { delay: result.delay })}</span>}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        className="max-w-lg flex flex-col max-h-[var(--dialog-available-height)] p-5 gap-3 overflow-hidden"
        onOpenAutoFocus={event => { event.preventDefault(); titleRef.current?.focus() }}
      >
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2 pr-6">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
              {t('geocheckTitle')}
            </DialogTitle>
            <Tooltip.Provider delayDuration={150}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    aria-label={t('serviceCheckHelp')}
                    className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <CircleHelp className="size-3.5" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="bottom"
                    sideOffset={6}
                    className="sidebar-tooltip z-[60] max-w-64 text-xs leading-normal"
                  >
                    {t('serviceCheckHint')}
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
          <DialogDescription className="wrap-anywhere leading-relaxed">
            <EmojiText text={nodeName} />
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher: GeoCheck vs Configured Endpoints */}
        <div className="flex items-center gap-1 border-b border-border/40 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('geocheck')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
              activeTab === 'geocheck'
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <ShieldCheck className="size-3.5" />
            <span>{t('geocheckTab')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('endpoints')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
              activeTab === 'endpoints'
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Globe className="size-3.5" />
            <span>{t('customEndpointsTab')}</span>
            <span className="ml-0.5 rounded-full bg-muted/80 px-1.5 py-0.2 text-[10px] text-muted-foreground font-mono">
              {targets.length}
            </span>
          </button>
        </div>

        {/* Services List ScrollArea */}
        <ScrollArea
          className="h-[280px] sm:h-[300px] shrink-0 pr-3"
          style={{ height: 280 }}
          data-service-check-list
        >
          <div
            className={cn('flex flex-col gap-2', activeTab !== 'geocheck' && 'hidden')}
            aria-live="polite"
            aria-busy={testing}
          >
            {REMNAWAVE_GEOCHECK_TARGETS.map(target => renderRow(target, false))}
          </div>
          <div
            className={cn('flex flex-col gap-2', activeTab !== 'endpoints' && 'hidden')}
            aria-live="polite"
            aria-busy={testing}
          >
            {targets.length === 0 && (
              <p className="py-3 text-xs text-muted-foreground">{t('noServiceCheckTargets')}</p>
            )}
            {targets.map(target => renderRow(target, true))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 pt-2.5 shrink-0 mt-auto">
          <div className="min-w-0 flex-1 pr-2">
            {error && <p role="alert" className="text-xs text-destructive truncate">{t('serviceCheckFailed')}</p>}
          </div>
          <Button size="sm" disabled={testing} onClick={check} className="cursor-pointer shrink-0">
            {testing ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                {t('testing')}
              </>
            ) : (
              t('checkServices')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
