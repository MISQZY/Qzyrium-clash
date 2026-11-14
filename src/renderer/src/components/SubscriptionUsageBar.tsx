import type { ProfileUserInfo } from '@shared/profile'
import { subscriptionUsage } from '@shared/subscription-health'
import { useLocale, useTranslations } from '../i18n'
import { formatBytes } from '../lib/format'
import { HelpCircle } from 'lucide-react'
import { Tooltip } from 'radix-ui'

export function SubscriptionUsageBar({ info, compact = false }: { info?: ProfileUserInfo; compact?: boolean }) {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const usage = subscriptionUsage(info)
  if (!usage) return null
  const percent = Math.floor(usage.percent)
  const tone = usage.status === 'exhausted' ? 'bg-destructive' : usage.status === 'near' ? 'bg-warning' : 'bg-primary'
  const textTone = usage.status === 'exhausted' ? 'text-destructive' : usage.status === 'near' ? 'text-warning' : 'text-foreground'
  const used = formatBytes(usage.used, locale), total = formatBytes(usage.total, locale)
  return <div className="space-y-2" data-subscription-usage={usage.status}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        {t('trafficUsed')}
        <Tooltip.Provider delayDuration={150}><Tooltip.Root>
          <Tooltip.Trigger asChild><button type="button" aria-label={t('trafficSnapshotHint')}
            className="inline-flex rounded-full text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-help">
            <HelpCircle className="size-3" aria-hidden="true" />
          </button></Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Content side="top" sideOffset={6} className="sidebar-tooltip max-w-56 text-center text-[11px] leading-snug">
            <p>{t('trafficSnapshotHint')}</p>
            {usage.status !== 'normal' && <p className="mt-1">{t(usage.status === 'exhausted' ? 'trafficExhausted' : 'trafficNearlyExhausted')}</p>}
            <Tooltip.Arrow className="fill-popover" />
          </Tooltip.Content></Tooltip.Portal>
        </Tooltip.Root></Tooltip.Provider>
      </span>
      <span className={`text-xs font-medium tabular-nums ${textTone}`}>{used}<span className="font-normal text-muted-foreground"> / {total}</span><span className="ml-2 text-[10px] text-muted-foreground">{percent}%</span></span>
    </div>
    <div role="progressbar" aria-label={t('trafficUsed')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      aria-valuetext={t('trafficUsageValue', { used, total, percent })}
      className="h-1.5 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/30">
      <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${tone}`} style={{ width: `${usage.percent}%` }} />
    </div>
    {!compact && usage.status !== 'normal' && <p className={`text-[10px] ${textTone}`}>
      {t(usage.status === 'exhausted' ? 'trafficExhausted' : 'trafficNearlyExhausted')}
    </p>}
  </div>
}
