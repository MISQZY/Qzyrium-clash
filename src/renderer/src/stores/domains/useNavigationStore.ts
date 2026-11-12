import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { NavTab } from '../../lib/navigation'

export interface NavigationStore {
  activeTab: NavTab
  setActiveTab: (tab: NavTab) => void
  visible: boolean
  setVisible: (visible: boolean) => void
  loading: boolean
  setLoading: (loading: boolean) => void
  busy: boolean
  setBusy: (busy: boolean) => void
  error: string | null
  setError: (error: string | null) => void
  dismissError: () => void
  reportError: (err: unknown) => void
  dataRevision: number
  setDataRevision: React.Dispatch<React.SetStateAction<number>>
  actionInProgress: React.MutableRefObject<boolean>
  refreshSequence: React.MutableRefObject<number>
  pendingRefresh: React.MutableRefObject<Promise<void> | null>
  statusRevision: React.MutableRefObject<number>
  mounted: React.MutableRefObject<boolean>
  createPerform: (refreshAll: () => Promise<void>) => (task: () => Promise<unknown>) => Promise<boolean>
}

export function useNavigationStore(): NavigationStore {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard')
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dataRevision, setDataRevision] = useState(0)

  const previousPage = useRef(activeTab)
  useEffect(() => {
    const previous = previousPage.current
    previousPage.current = activeTab
    // Release detached page resources after leaving a large view or hiding.
    // This clears unused Chromium caches, without evicting resident OS pages.
    if (visible && (previous === activeTab || !['settings', 'rules', 'connections', 'profiles'].includes(previous))) return
    const timer = setTimeout(() => window.api?.window.releaseUnusedMemory?.(), 150)
    return () => clearTimeout(timer)
  }, [activeTab, visible])

  const actionInProgress = useRef(false)
  const refreshSequence = useRef(0)
  const pendingRefresh = useRef<Promise<void> | null>(null)
  const statusRevision = useRef(0)
  const mounted = useRef(false)

  const reportError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : String(err))
  }, [])

  const dismissError = useCallback(() => {
    setError(null)
  }, [])

  const createPerform = useCallback(
    (refreshAll: () => Promise<void>) => {
      return async (task: () => Promise<unknown>): Promise<boolean> => {
        if (!window.api || actionInProgress.current) return false
        actionInProgress.current = true
        refreshSequence.current++
        setBusy(true)
        setError(null)
        try {
          await task()
          if (pendingRefresh.current) await pendingRefresh.current.catch(() => {})
          await refreshAll()
          return true
        } catch (err) {
          reportError(err)
          if (pendingRefresh.current) await pendingRefresh.current.catch(() => {})
          await refreshAll().catch(() => {})
          return false
        } finally {
          actionInProgress.current = false
          setBusy(false)
        }
      }
    },
    [reportError]
  )

  return useMemo(() => ({
    activeTab,
    setActiveTab,
    visible,
    setVisible,
    loading,
    setLoading,
    busy,
    setBusy,
    error,
    setError,
    dismissError,
    reportError,
    dataRevision,
    setDataRevision,
    actionInProgress,
    refreshSequence,
    pendingRefresh,
    statusRevision,
    mounted,
    createPerform
  }), [activeTab, setActiveTab, visible, setVisible, loading, setLoading, busy, setBusy, error, setError, dismissError, reportError, dataRevision, setDataRevision, actionInProgress, refreshSequence, pendingRefresh, statusRevision, mounted, createPerform])
}
