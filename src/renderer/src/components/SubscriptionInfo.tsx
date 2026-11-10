import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Gauge } from 'lucide-react'
import type { ProfileUserInfo } from '@shared/profile'
import { useLocale, useTranslations } from '../i18n'
import { formatBytes } from '../lib/format'

export function SubscriptionInfo({ info }: { info?: ProfileUserInfo }) {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const valid = (value?: number): value is number => value !== undefined && Number.isFinite(value) && value >= 0
  const total = valid(info?.total) ? info.total : undefined
  const hasUsage = valid(info?.upload) || valid(info?.download)
  const used = (valid(info?.upload) ? info.upload : 0) + (valid(info?.download) ? info.download : 0)
  const remaining = total !== undefined && total > 0 && hasUsage ? Math.max(0, total - used) : undefined
  const timestamp = valid(info?.expire) && info.expire > 0 ? info.expire * 1000 : undefined
  const expires = timestamp !== undefined && !Number.isNaN(new Date(timestamp).getTime()) ? timestamp : undefined
  const noExpiration = info?.expire === 0
  const days = expires !== undefined ? Math.max(0, Math.ceil((expires - now) / 86_400_000)) : undefined
  const expirationDate = expires !== undefined
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(expires)
    : undefined
  const items = [
    { icon: Gauge, label: t('trafficRemaining'), value: total === 0 ? t('unlimitedTraffic') : remaining !== undefined ? formatBytes(remaining, locale) : t('notProvided'), warning: remaining === 0 },
    { icon: Clock3, label: t('daysRemaining'), value: noExpiration ? t('noExpiration') : days === undefined ? t('notProvided') : days === 0 ? t('expired') : t('daysValue', { count: days }), warning: days !== undefined && days <= 3 },
    { icon: CalendarDays, label: t('expiresOn'), value: noExpiration ? t('noExpiration') : expirationDate ?? t('notProvided'), warning: days === 0 }
  ]

  return (
    <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border/50 bg-background/25 p-3 sm:grid-cols-3 sm:gap-4" data-subscription-info>
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
  )
}
