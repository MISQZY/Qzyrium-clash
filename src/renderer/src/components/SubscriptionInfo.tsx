import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Gauge } from 'lucide-react'
import type { ProfileUserInfo } from '@shared/profile'
import { useLocale, useTranslations } from '../i18n'
import { formatBytes } from '../lib/format'
import { SubscriptionUsageBar } from './SubscriptionUsageBar'
import { subscriptionExpiry, subscriptionUsage } from '@shared/subscription-health'

export function SubscriptionInfo({ info }: { info?: ProfileUserInfo }) {
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
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(expiry.expiresMs)
    : undefined
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
    {subscriptionUsage(info) && <div className="mt-3 border-t border-border/40 pt-3"><SubscriptionUsageBar info={info} /></div>}
    </div>
  )
}
