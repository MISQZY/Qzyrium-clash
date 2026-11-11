import type { ReactNode } from 'react'
import { useAppStoreInternal } from './useWorkspaceStore'
import { provideDomainStores } from './provideDomainStores'

export { useAppStoreInternal }
export type { NavTab } from '../lib/navigation'
export * from './domains'
export {
  useRefreshAll,
  NavigationContext,
  useNavigation,
  KernelContext,
  useKernel,
  TrafficContext,
  useTraffic,
  ProfilesContext,
  useProfiles,
  SettingsContext,
  useSettings,
  ProxiesContext,
  useProxies,
  RulesContext,
  useRules,
  ConnectionsContext,
  useConnections,
  LogsContext,
  useLogs
} from './store-contexts'

export function AppStoreProvider({ children }: { children: ReactNode }) {
  return provideDomainStores(useAppStoreInternal(), children)
}
