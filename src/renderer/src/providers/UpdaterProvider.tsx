import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppUpdaterStatus } from '@shared/updater'

const UpdaterContext = createContext<AppUpdaterStatus>({ state: 'idle' })

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppUpdaterStatus>({ state: 'idle' })
  useEffect(() => {
    if (!window.api?.app?.getUpdaterStatus) return
    let active = true
    let receivedEvent = false
    const unsubscribe = window.api.events.onUpdaterStatus((next) => {
      receivedEvent = true
      if (active) setStatus(next)
    })
    void window.api.app.getUpdaterStatus().then((next) => {
      if (active && !receivedEvent) setStatus(next)
    }).catch(() => {})
    return () => { active = false; unsubscribe() }
  }, [])
  return <UpdaterContext.Provider value={status}>{children}</UpdaterContext.Provider>
}

export const useUpdaterStatus = () => useContext(UpdaterContext)
