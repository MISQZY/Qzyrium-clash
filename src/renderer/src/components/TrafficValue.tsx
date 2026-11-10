import { useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useLocale } from '../i18n'
import { formatBytes } from '../lib/format'

export function TrafficValue({ value, direction, className = '' }: {
  value: number
  direction: 'download' | 'upload'
  className?: string
}) {
  const locale = useLocale()
  const element = useRef<HTMLSpanElement>(null)
  const previous = useRef(value)
  const animation = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    if (value > previous.current && element.current) {
      animation.current?.cancel()
      animation.current = element.current.animate([
        { color: 'var(--primary)', offset: 0 },
        { color: 'var(--primary)', offset: 0.35 },
        { color: 'var(--muted-foreground)', offset: 1 }
      ], { duration: 2200, easing: 'ease-out' })
    } else if (value < previous.current) {
      animation.current?.cancel()
    }
    previous.current = value
  }, [value])

  useEffect(() => () => { animation.current?.cancel() }, [])

  const Icon = direction === 'download' ? ArrowDown : ArrowUp
  return (
    <span ref={element} data-traffic={direction} className={`text-muted-foreground inline-flex items-center gap-0.5 font-medium tabular-nums ${className}`}>
      <Icon className="size-3 shrink-0" />
      {formatBytes(value, locale)}
    </span>
  )
}
