import { useMemo, useState, useEffect } from 'react'
import type { MihomoRule } from '@shared/mihomo'
import type { StoreCoordinator } from './types'

export interface RulesStore {
  rules: MihomoRule[]
  setRules: React.Dispatch<React.SetStateAction<MihomoRule[]>>
}

export function useRulesStore(
  coord: StoreCoordinator,
  busy: boolean,
  refreshing: boolean,
  loading: boolean
): RulesStore {
  const { visible, activeTab, settings, coreStatus, statusRevision, actionInProgress, reportError, dataRevision } = coord
  const [rules, setRules] = useState<MihomoRule[]>([])
  const needsRules = visible && (activeTab === 'rules' || (
    activeTab === 'dashboard' && !settings.general.liteDashboard
  ))
  const scope = activeTab === 'rules' ? undefined : 'summary'

  useEffect(() => {
    // Drop the full dataset immediately when leaving its page, including while
    // a replacement request is pending. Old responses cannot restore it.
    setRules([])
    if (!window.api || !needsRules || coreStatus === 'starting' || busy || refreshing || loading) return
    let disposed = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const revision = statusRevision.current
    const current = () =>
      !disposed && !actionInProgress.current && revision === statusRevision.current

    const load = async (attempt = 0): Promise<void> => {
      try {
        const value = await window.api.mihomo.getRules(scope)
        if (current()) setRules(value)
      } catch (err) {
        if (!current()) return
        if (attempt < 2) {
          const timer = setTimeout(
            () => {
              timers.delete(timer)
              void load(attempt + 1)
            },
            1000 * 2 ** attempt
          )
          timers.add(timer)
        } else {
          reportError(err)
        }
      }
    }

    void load()
    return () => {
      disposed = true
      timers.forEach(clearTimeout)
    }
  }, [
    coreStatus,
    needsRules,
    scope,
    busy,
    refreshing,
    loading,
    dataRevision,
    reportError,
    statusRevision,
    actionInProgress
  ])

  return useMemo(() => ({
    rules,
    setRules
  }), [rules, setRules])
}
