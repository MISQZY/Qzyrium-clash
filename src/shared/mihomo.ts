export type ProviderKind = 'proxies' | 'rules'

export interface ProviderSummary {
  name: string
  vehicleType: string
  updatedAt?: string
  itemCount: number
}

export interface ProxyNodeHistory {
  time: string
  delay: number
}

export interface ProxyNode {
  name: string
  type: string
  udp: boolean
  xudp?: boolean
  tfo?: boolean
  history: ProxyNodeHistory[]
  now?: string
  hidden?: boolean
  icon?: string
}

export interface ProxyGroup extends ProxyNode {
  all: string[]
  now: string
  hidden?: boolean
  icon?: string
}

export type ProxyItem = ProxyNode | ProxyGroup

export const BUILTIN_PROXY_NAMES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'REJECTDROP',
  'PASS',
  'PASS-RULE',
  'PASSRULE',
  'PATHRULE',
  'COMPATIBLE',
  'GLOBAL',
  'DNS-OUT',
  'DNS'
])

export const NON_PROXY_TYPES = new Set([
  'direct',
  'reject',
  'reject-drop',
  'rejectdrop',
  'compatible',
  'pass',
  'pass-rule',
  'passrule',
  'pathrule',
  'dns'
])

export function isProxyGroup(item?: ProxyNode | null): item is ProxyGroup {
  return !!item && Array.isArray((item as ProxyGroup).all)
}

export function isRealProxyNode(name: string, proxies?: Record<string, ProxyNode>): boolean {
  if (!name) return false
  const upper = name.toUpperCase()
  if (
    BUILTIN_PROXY_NAMES.has(upper) ||
    upper.startsWith('DNS-OUT') ||
    upper.startsWith('PASS-RULE') ||
    upper.startsWith('PASSRULE') ||
    upper.startsWith('PATHRULE')
  ) {
    return false
  }
  if (!proxies) return true
  const item = proxies[name]
  if (!item) return true
  if (isProxyGroup(item)) return false
  const rawType = (item.type || '').toLowerCase().replace(/[-_]/g, '')
  if (NON_PROXY_TYPES.has(rawType)) {
    return false
  }
  return true
}

export function resolveLeafNode(name: string, proxies: Record<string, ProxyNode>, visited = new Set<string>()): string {
  if (!name || visited.has(name) || visited.size > 20) return name
  visited.add(name)
  const item = proxies[name]
  if (!item) return name
  if (isProxyGroup(item) && item.now) {
    const next = resolveLeafNode(item.now, proxies, visited)
    if (next && isRealProxyNode(next, proxies)) return next
  }
  return name
}

export function createProxyGroupComparator(
  proxies: Record<string, ProxyNode>,
  mode?: string
): (a: string, b: string) => number {
  const configuredOrder = [
    ...new Set([
      ...((proxies.GLOBAL as ProxyGroup | undefined)?.all ?? []),
      ...Object.keys(proxies)
    ])
  ]
  const order = new Map(configuredOrder.map((name, index) => [name, index]))
  if (mode === 'global') order.set('GLOBAL', -1)
  return (a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity)
}

export interface MihomoRule {
  type: string
  payload: string
  proxy: string
  size?: number
}

export interface ConnectionMetadata {
  remoteDestination?: string
  network: string
  type: string
  sourceIP: string
  destinationIP: string
  sourcePort: string
  destinationPort: string
  host: string
  dnsMode: string
  processPath: string
  process?: string
  sniffHost?: string
  destinationIPASN?: string
  destinationGeoIP?: string[]
  sourceIPASN?: string
  sourceGeoIP?: string[]
  inboundIP?: string
  inboundPort?: string
  inboundName?: string
  inboundUser?: string
  uid?: number
  dscp?: number
}

export interface ConnectionItem {
  id: string
  metadata: ConnectionMetadata
  upload: number
  download: number
  start: string
  chains: string[]
  rule: string
  rulePayload: string
  uploadSpeed?: number
  downloadSpeed?: number
}

export interface ConnectionsSnapshot {
  subscriptionTraffic?: { key: string; runtimeDeltaBytes: number }
  downloadTotal: number
  uploadTotal: number
  directDownloadTotal?: number
  directUploadTotal?: number
  vpnDownloadTotal?: number
  vpnUploadTotal?: number
  vpnTrafficIsLowerBound?: boolean
  connections: ConnectionItem[]
}
