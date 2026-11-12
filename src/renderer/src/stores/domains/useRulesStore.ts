import { useMemo, useState, useEffect } from 'react'
import type { MihomoRule } from '@shared/mihomo'
import type { StoreCoordinator } from './types'
import { loadDataset } from './loadDataset'

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
    return loadDataset(
      { statusRevision, actionInProgress, reportError },
      () => window.api.mihomo.getRules(scope),
      setRules
    )
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
