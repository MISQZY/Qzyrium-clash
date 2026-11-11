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
  downloadTotal: number
  uploadTotal: number
  directDownloadTotal?: number
  directUploadTotal?: number
  connections: ConnectionItem[]
}
