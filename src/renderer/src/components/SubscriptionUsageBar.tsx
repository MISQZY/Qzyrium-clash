import type { ProfileUserInfo } from '@shared/profile'
import { subscriptionUsage } from '@shared/subscription-health'
import { useLocale, useTranslations } from '../i18n'
import { formatBytes } from '../lib/format'

export function SubscriptionUsageBar({ info }: { info?: ProfileUserInfo }) {
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
      <span className="text-[10px] text-muted-foreground">{t('trafficUsed')}</span>
      <span className={`text-xs font-medium tabular-nums ${textTone}`}>{used}<span className="font-normal text-muted-foreground"> / {total}</span></span>
    </div>
    <div role="progressbar" aria-label={t('trafficUsed')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      aria-valuetext={t('trafficUsageValue', { used, total, percent })}
      className="h-1.5 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/30">
      <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${tone}`} style={{ width: `${usage.percent}%` }} />
    </div>
    <div className="flex items-start justify-between gap-3 text-[10px] text-muted-foreground">
      <span>{t(usage.status === 'exhausted' ? 'trafficExhausted' : usage.status === 'near' ? 'trafficNearlyExhausted' : 'trafficSnapshotHint')}</span>
      <span className={`shrink-0 tabular-nums ${usage.status === 'normal' ? '' : textTone}`}>{percent}%</span>
    </div>
  </div>
}
