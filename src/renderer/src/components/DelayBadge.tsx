import { Badge } from './ui/badge'
import { useTranslations } from '../i18n'

export function DelayBadge({ delay, loading = false }: { delay?: number; loading?: boolean }) {
  const t = useTranslations('proxies')
    if (loading) {
      return (
        <span className="inline-flex items-center justify-center" role="status" aria-label={t('testing')}>
          <span className="latency-loader" aria-hidden="true" />
        </span>
      )
    }
    if (delay === undefined) return null
    if (delay === -1) {
      return (
        <Badge variant="destructive" className="text-[10px] py-0 px-1.5 font-mono">
          {t('timeout')}
        </Badge>
      )
    }
    if (delay < 200) {
      return (
        <Badge variant="success" className="text-[10px] py-0 px-1.5 font-mono">
          {t('latency', { delay })}
        </Badge>
      )
    }
    if (delay < 500) {
      return (
        <Badge variant="warning" className="text-[10px] py-0 px-1.5 font-mono">
          {t('latency', { delay })}
        </Badge>
      )
    }
    return (
      <Badge variant="destructive" className="text-[10px] py-0 px-1.5 font-mono">
        {t('latency', { delay })}
      </Badge>
    )
  }
