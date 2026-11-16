import { memo } from 'react'
import { useTranslations } from '../../i18n'
import { formatLogTime, type PresentedLog } from '../../lib/log-presentation'

const LEVEL_COLORS = {
  warning: 'text-warning font-semibold',
  error: 'text-destructive font-semibold',
  debug: 'text-muted-foreground',
  info: 'text-primary font-semibold'
}

export const LogRow = memo(function LogRow({ item, formatter }: { item: PresentedLog; formatter: Intl.DateTimeFormat }) {
  const common = useTranslations('common')
  return <div className="grid grid-cols-[auto_6rem_minmax(0,1fr)] items-start gap-3 py-1 leading-relaxed border-b border-border/40 last:border-0 hover:bg-muted/20">
    <time className="text-muted-foreground shrink-0 tabular-nums" title={item.time}>[{formatLogTime(item.time, formatter)}]</time>
    <span className={`uppercase text-[10px] pt-px ${LEVEL_COLORS[item.level]}`}>{common(item.level)}</span>
    <span className="min-w-0 text-foreground/90 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.message}</span>
  </div>
})
