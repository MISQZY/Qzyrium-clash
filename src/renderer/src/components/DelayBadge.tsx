import { useTranslations } from '../i18n'
import { cn } from '../lib/utils'

export function DelayBadge({
  delay,
  loading = false,
  className
}: {
  delay?: number
  loading?: boolean
  className?: string
}) {
  const t = useTranslations('proxies')

  if (loading) {
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        role="status"
        aria-label={t('testing')}
      >
        <span className="latency-loader" aria-hidden="true" />
      </span>
    )
  }

  if (delay === undefined) return null

  if (delay <= 0) {
    return (
      <span
        className={cn(
          'text-[11px] font-mono font-semibold text-muted-foreground select-none',
          className
        )}
      >
        {t('timeout')}
      </span>
    )
  }

  if (delay < 200) {
    return (
      <span
        className={cn(
          'text-[11px] font-mono font-semibold text-success select-none',
          className
        )}
      >
        {t('latency', { delay })}
      </span>
    )
  }

  if (delay < 500) {
    return (
      <span
        className={cn(
          'text-[11px] font-mono font-semibold text-warning select-none',
          className
        )}
      >
        {t('latency', { delay })}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'text-[11px] font-mono font-semibold text-destructive select-none',
        className
      )}
    >
      {t('latency', { delay })}
    </span>
  )
}

export const DelayText = DelayBadge

