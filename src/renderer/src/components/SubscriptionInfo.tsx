import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Gauge } from 'lucide-react'
import type { ProfileUserInfo } from '@shared/profile'
import { useLocale, useTranslations } from '../i18n'
import { formatBytes } from '../lib/format'
import { SubscriptionUsageBar } from './SubscriptionUsageBar'
import { subscriptionExpiry, subscriptionUsage } from '@shared/subscription-health'

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>()

function getExpiryDateFormatter(locale: string): Intl.DateTimeFormat {
  let formatter = dateTimeFormatCache.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    dateTimeFormatCache.set(locale, formatter)
  }
  return formatter
}

export function SubscriptionInfo({ info, compact = false }: { info?: ProfileUserInfo; compact?: boolean }) {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const usage = subscriptionUsage(info)
  const expiry = subscriptionExpiry(info, now)
  const expirationDate = expiry.expiresMs !== undefined
    ? getExpiryDateFormatter(locale).format(expiry.expiresMs)
    : undefined

  if (compact) {
    return (
      <div className="rounded-xl border border-border/50 bg-background/25 p-2.5 space-y-2" data-subscription-info>
        <dl className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[10px] text-muted-foreground truncate">{t('trafficRemaining')}</dt>
            <dd className={`font-medium tabular-nums text-xs ${usage?.remaining === 0 ? 'text-warning' : 'text-foreground'}`}>
              {info?.total === 0 ? t('unlimitedTraffic') : usage ? formatBytes(usage.remaining, locale) : t('notProvided')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[10px] text-muted-foreground truncate">{t('expiresOn')}</dt>
            <dd className={`font-medium tabular-nums text-xs ${expiry.isExpired ? 'text-warning' : 'text-foreground'}`}>
              {expiry.noExpiration ? t('noExpiration') : expirationDate ?? t('notProvided')}
            </dd>
          </div>
        </dl>
        {usage && <div className="border-t border-border/40 pt-2"><SubscriptionUsageBar info={info} /></div>}
      </div>
    )
  }
  const items = [
    {
      icon: Gauge,
      label: t('trafficRemaining'),
      value: info?.total === 0 ? t('unlimitedTraffic') : usage ? formatBytes(usage.remaining, locale) : t('notProvided'),
      warning: usage?.remaining === 0
    },
    {
      icon: Clock3,
      label: t('daysRemaining'),
      value: expiry.noExpiration
        ? t('noExpiration')
        : expiry.daysRemaining === undefined
          ? t('notProvided')
          : expiry.isExpired
            ? t('expired')
            : t('daysValue', { count: expiry.daysRemaining }),
      warning: expiry.isExpiringSoon
    },
    {
      icon: CalendarDays,
      label: t('expiresOn'),
      value: expiry.noExpiration ? t('noExpiration') : expirationDate ?? t('notProvided'),
      warning: expiry.isExpired
    }
  ]

  return (
    <div className="rounded-xl border border-border/50 bg-background/25 p-3" data-subscription-info>
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {items.map(({ icon: Icon, label, value, warning }) => (
        <div key={label} className="flex min-w-0 items-start gap-2.5">
          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-[10px] text-muted-foreground">{label}</dt>
            <dd className={`mt-1 text-xs font-medium tabular-nums ${warning ? 'text-warning' : 'text-foreground'}`}>{value}</dd>
          </div>
        </div>
      ))}
    </dl>
    {usage && <div className="mt-3 border-t border-border/40 pt-3"><SubscriptionUsageBar info={info} /></div>}
    </div>
  )
}
