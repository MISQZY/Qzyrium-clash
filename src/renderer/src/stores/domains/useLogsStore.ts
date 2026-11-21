import { useEffect, useRef, useCallback } from 'react'
import { create } from 'zustand'
import type { LogEntry } from '@shared/types'
import { LogBuffer } from '@shared/log-buffer'
import type { StoreCoordinator } from './types'

export interface LogsStoreState {
  logs: LogEntry[]
  setLogs: (logs: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void
  clearLogs: (source?: 'app' | 'mihomo') => void
}

export const useLogsStore = create<LogsStoreState>((set) => ({
  logs: [],
  setLogs: (logs) =>
    set((state) => ({
      logs: typeof logs === 'function' ? logs(state.logs) : logs
    })),
  clearLogs: () => set({ logs: [] })
}))

export type LogsStore = LogsStoreState

export const useLogs = useLogsStore

/**
 * Syncs Mihomo and app logs to Zustand outside the React root context lifecycle.
 * Prevents high-frequency log streams from causing cascading re-renders in useAppStoreInternal.
 */
export function useLogsSync(coord: StoreCoordinator): LogsStoreState {
  const logBuffer = useRef(new LogBuffer(coord.settings.general.maxLogs ?? 300))
  const activeView = useRef({ activeTab: coord.activeTab, visible: coord.visible })
  activeView.current = { activeTab: coord.activeTab, visible: coord.visible }
  const maxLogsRef = useRef(coord.settings.general.maxLogs)
  maxLogsRef.current = coord.settings.general.maxLogs

  useEffect(() => {
    const limit = coord.settings.general.maxLogs ?? 300
    logBuffer.current.resize(limit)
    if (activeView.current.activeTab === 'logs' && activeView.current.visible) {
      useLogsStore.getState().setLogs(logBuffer.current.snapshot())
    }
  }, [coord.settings.general.maxLogs])

  useEffect(() => {
    if (!window.api?.events?.onLogs && !window.api?.events?.onLog) return
    const append = (batch: LogEntry[]) => {
      logBuffer.current.resize(maxLogsRef.current ?? 300)
      for (const log of batch) logBuffer.current.push(log)
    }
    const unsub = window.api.events.onLogs
      ? window.api.events.onLogs(append)
      : window.api.events.onLog((log) => append([log]))
    return unsub
  }, [])

  useEffect(() => {
    if (!coord.visible || coord.activeTab !== 'logs') {
      useLogsStore.getState().setLogs([])
      return
    }
    let revision = logBuffer.current.revision
    const flush = () => {
      if (revision === logBuffer.current.revision) return
      revision = logBuffer.current.revision
      useLogsStore.getState().setLogs(logBuffer.current.snapshot())
    }
    // Publish the accumulated buffer immediately when returning to the logs page.
    useLogsStore.getState().setLogs(logBuffer.current.snapshot())
    revision = logBuffer.current.revision
    const timer = setInterval(flush, 250)
    return () => clearInterval(timer)
  }, [coord.activeTab, coord.visible])

  const clearLogs = useCallback((source?: 'app' | 'mihomo') => {
    logBuffer.current.clear(source)
    useLogsStore.getState().setLogs(logBuffer.current.snapshot())
  }, [])

  useEffect(() => {
    useLogsStore.setState({ clearLogs })
  }, [clearLogs])

  return useLogsStore.getState()
}
