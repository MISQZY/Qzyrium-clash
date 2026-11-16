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
    let timer: NodeJS.Timeout | null = null
    const sync = () => setNow(Date.now())

    const startTimer = () => {
      if (timer) return
      sync()
      timer = setInterval(sync, 1000)
    }

    const stopTimer = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopTimer()
      } else {
        startTimer()
      }
    }

    if (!document.hidden) {
      startTimer()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', sync)
    return () => {
      stopTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', sync)
    }
  }, [running])

  return (
    <output aria-label={ariaLabel} className="overview-session-duration">
      {formatDuration(startedAt ? now - startedAt : 0)}
    </output>
  )
}
