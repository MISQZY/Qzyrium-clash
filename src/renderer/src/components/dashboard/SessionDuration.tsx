import { useEffect, useState } from 'react'
import { formatDuration } from '../../lib/format'

export interface SessionDurationProps {
  startedAt: number | null
  running: boolean
  ariaLabel: string
}

export function SessionDuration({ startedAt, running, ariaLabel }: SessionDurationProps) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (!running) return
    const sync = () => setNow(Date.now())
    sync()
    const timer = setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [running])

  return (
    <output aria-label={ariaLabel} className="overview-session-duration">
      {formatDuration(startedAt ? now - startedAt : 0)}
    </output>
  )
}
