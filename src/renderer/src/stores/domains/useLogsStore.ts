import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import type { LogEntry } from '@shared/types'
import { LogBuffer } from '@shared/log-buffer'
import type { StoreCoordinator } from './types'

export interface LogsStore {
  logs: LogEntry[]
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  clearLogs: (source?: 'app' | 'mihomo') => void
}

export function useLogsStore(coord: StoreCoordinator): LogsStore {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logBuffer = useRef(new LogBuffer(coord.settings.general.maxLogs ?? 300))
  const activeView = useRef({ activeTab: coord.activeTab, visible: coord.visible })
  activeView.current = { activeTab: coord.activeTab, visible: coord.visible }
  const maxLogsRef = useRef(coord.settings.general.maxLogs)
  maxLogsRef.current = coord.settings.general.maxLogs

  useEffect(() => {
    const limit = coord.settings.general.maxLogs ?? 300
    logBuffer.current.resize(limit)
    if (activeView.current.activeTab === 'logs' && activeView.current.visible) {
      setLogs(logBuffer.current.snapshot())
    }
  }, [coord.settings.general.maxLogs])

  useEffect(() => {
    if (!window.api?.events?.onLog) return
    const append = (batch: LogEntry[]) => {
      logBuffer.current.resize(maxLogsRef.current ?? 300)
      for (const log of batch) logBuffer.current.push(log)
    }
    const unsub = window.api.events.onLogs
      ? window.api.events.onLogs(append)
      : window.api.events.onLog(log => append([log]))
    return unsub
  }, [])

  useEffect(() => {
    if (!coord.visible || coord.activeTab !== 'logs') {
      setLogs([])
      return
    }
    let revision = logBuffer.current.revision
    const flush = () => {
      if (revision === logBuffer.current.revision) return
      revision = logBuffer.current.revision
      setLogs(logBuffer.current.snapshot())
    }
    // Publish the accumulated buffer immediately when returning to the logs page.
    setLogs(logBuffer.current.snapshot())
    revision = logBuffer.current.revision
    const timer = setInterval(flush, 250)
    return () => clearInterval(timer)
  }, [coord.activeTab, coord.visible])

  const clearLogs = useCallback((source?: 'app' | 'mihomo') => {
    logBuffer.current.clear(source)
    setLogs(logBuffer.current.snapshot())
  }, [])

  return useMemo(() => ({
    logs,
    setLogs,
    clearLogs
  }), [logs, setLogs, clearLogs])
}
