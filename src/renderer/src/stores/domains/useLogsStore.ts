import { useState, useEffect, useRef, useCallback } from 'react'
import type { LogEntry } from '@shared/types'
import type { StoreCoordinator } from './types'

export interface LogsStore {
  logs: LogEntry[]
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  clearLogs: () => void
}

export function useLogsStore(coord: StoreCoordinator): LogsStore {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logBuffer = useRef<LogEntry[]>([])
  const activeView = useRef({ activeTab: coord.activeTab, visible: coord.visible })
  activeView.current = { activeTab: coord.activeTab, visible: coord.visible }
  const maxLogsRef = useRef(coord.settings.general.maxLogs)
  maxLogsRef.current = coord.settings.general.maxLogs

  useEffect(() => {
    const limit = coord.settings.general.maxLogs ?? 300
    if (logBuffer.current.length <= limit) return
    logBuffer.current.splice(0, logBuffer.current.length - limit)
    if (activeView.current.activeTab === 'logs' && activeView.current.visible) {
      setLogs([...logBuffer.current])
    }
  }, [coord.settings.general.maxLogs])

  useEffect(() => {
    if (!window.api?.events?.onLog) return
    const unsub = window.api.events.onLog((log) => {
      logBuffer.current.push(log)
      const limit = maxLogsRef.current ?? 300
      if (logBuffer.current.length > limit) {
        logBuffer.current.splice(0, logBuffer.current.length - limit)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!coord.visible) {
      setLogs([])
      return
    }
    if (coord.activeTab !== 'logs') return
    let lastEntry: LogEntry | undefined
    const flush = () => {
      const latest = logBuffer.current.at(-1)
      if (latest === lastEntry) return
      lastEntry = latest
      setLogs([...logBuffer.current])
    }
    // Publish the accumulated buffer immediately when returning to the logs page.
    setLogs([...logBuffer.current])
    lastEntry = logBuffer.current.at(-1)
    const timer = setInterval(flush, 250)
    return () => clearInterval(timer)
  }, [coord.activeTab, coord.visible])

  const clearLogs = useCallback(() => {
    logBuffer.current = []
    setLogs([])
  }, [])

  return {
    logs,
    setLogs,
    clearLogs
  }
}
