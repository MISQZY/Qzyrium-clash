import { createContext, useContext } from 'react'
import type { DomainStores } from './useWorkspaceStore'

function createStoreContext<T>(hookName: string) {
  const context = createContext<T | null>(null)
  context.displayName = hookName.replace(/^use/, '')
  function useDomain() {
    const value = useContext(context)
    if (value === null) throw new Error(`${hookName} must be used within an AppStoreProvider`)
    return value
  }
  return [context, useDomain] as const
}

export const [RefreshContext, useRefreshAll] = createStoreContext<DomainStores['refreshAll']>('useRefreshAll')
export const [NavigationContext, useNavigation] = createStoreContext<DomainStores['navigation']>('useNavigation')
export const [KernelContext, useKernel] = createStoreContext<DomainStores['kernel']>('useKernel')
export const [TrafficContext, useTraffic] = createStoreContext<DomainStores['traffic']>('useTraffic')
export const [ProfilesContext, useProfiles] = createStoreContext<DomainStores['profiles']>('useProfiles')
export const [SettingsContext, useSettings] = createStoreContext<DomainStores['settings']>('useSettings')
export const [ProxiesContext, useProxies] = createStoreContext<DomainStores['proxies']>('useProxies')
export const [RulesContext, useRules] = createStoreContext<DomainStores['rules']>('useRules')
export const [ConnectionsContext, useConnections] = createStoreContext<DomainStores['connections']>('useConnections')
export const [LogsContext, useLogs] = createStoreContext<DomainStores['logs']>('useLogs')
