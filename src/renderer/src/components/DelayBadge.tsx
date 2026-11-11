import { Badge } from './ui/badge'
import { useTranslations } from '../i18n'

export function DelayBadge({ delay }: { delay?: number }) {
  const t = useTranslations('proxies')
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
