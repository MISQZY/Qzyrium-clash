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
}

export interface ProxyGroup extends ProxyNode {
  all: string[]
  now: string
}

export interface MihomoRule {
  type: string
  payload: string
  proxy: string
  size?: number
}

export interface ConnectionMetadata {
  network: string
  type: string
  sourceIP: string
  destinationIP: string
  sourcePort: string
  destinationPort: string
  host: string
  dnsMode: string
  processPath: string
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
}

export interface ConnectionsSnapshot {
  downloadTotal: number
  uploadTotal: number
  connections: ConnectionItem[]
}
