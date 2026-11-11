import type { MutableRefObject } from 'react'
import type { AppConfig } from '@shared/app-config'
import type { ConnectionsSnapshot, MihomoRule, ProxyNode } from '@shared/mihomo'
import type { ProfileItem, CustomRuleItem } from '@shared/profile'
import type { CoreState, LogEntry, TrafficStats } from '@shared/types'
import type { SysProxyStatus } from '@shared/ipc'
import type { NavTab } from '../../lib/navigation'

export const EMPTY_CONNECTIONS: ConnectionsSnapshot = {
  downloadTotal: 0,
  uploadTotal: 0,
  directDownloadTotal: 0,
  directUploadTotal: 0,
  connections: []
}

export interface StoreCoordinator {
  activeTab: NavTab
  visible: boolean
  coreStatus: CoreState
  settings: AppConfig
  dataRevision: number
  statusRevision: MutableRefObject<number>
  mounted: MutableRefObject<boolean>
  actionInProgress: MutableRefObject<boolean>
  reportError: (err: unknown) => void
  perform: (task: () => Promise<unknown>) => Promise<boolean>
  refreshAll: () => Promise<void>
}
