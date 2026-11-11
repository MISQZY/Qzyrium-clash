import type { ConnectionItem } from '@shared/mihomo'

export function extractProcessName(processPath?: string): string {
  if (!processPath) return ''
  const base = processPath.split(/[\\/]/).pop() || ''
  return base.trim()
}

export function getSubDomains(domain: string): string[] {
  const parts = domain.split('.')
  if (parts.length <= 2) return [domain]
  return parts.map((_, i) => parts.slice(i).join('.')).slice(0, -1)
}

// Mihomo reports the selected leaf first; show routing from group to leaf.
export function formatChain(chains: string[]): string {
  return [...chains].reverse().join(' \u2192 ') || 'DIRECT'
}

export function isIPv6(ip: string): boolean {
  return ip.includes(':')
}

export interface ProcessGroup {
  key: string
  name: string
  path: string
  connections: ConnectionItem[]
  activeCount: number
  totalUpload: number
  totalDownload: number
  latestStart: number
}

