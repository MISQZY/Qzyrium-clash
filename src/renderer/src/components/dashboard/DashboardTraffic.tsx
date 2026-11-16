import type { ProfileItem } from '@shared/profile'
import { subscriptionUsage, subscriptionTrafficKey } from '@shared/subscription-health'
import { useConnections, useTraffic } from '../../stores/useAppStore'
import { SubscriptionUsageBar } from '../SubscriptionUsageBar'
import { SessionTrafficMetrics } from './SessionTrafficMetrics'

export function DashboardTrafficMetrics({ onlyVpnTraffic }: { onlyVpnTraffic: boolean }) {
  const { traffic } = useTraffic()
  const { connections } = useConnections()
  return <SessionTrafficMetrics connections={connections} traffic={traffic} onlyVpnTraffic={onlyVpnTraffic} />
}

export function DashboardQuota({ activeProfile }: { activeProfile: ProfileItem | null }) {
  const { subscriptionTraffic } = useConnections()
  const runtimeVpnDelta = activeProfile && subscriptionTraffic?.key === subscriptionTrafficKey(activeProfile)
    ? subscriptionTraffic.runtimeDeltaBytes
    : 0
  if (!subscriptionUsage(activeProfile?.userInfo, runtimeVpnDelta)) return null
  return <div className="overview-panel-section overview-quota-section">
    <SubscriptionUsageBar info={activeProfile?.userInfo} runtimeDelta={runtimeVpnDelta} compact />
  </div>
}
