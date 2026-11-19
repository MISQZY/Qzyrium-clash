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

export interface RuleOption {
  label: string
  value: string
}

export function createRuleOption(type: string, value: string): RuleOption {
  return { label: type, value: `${type},${value}` }
}

export function createCidrRuleOption(type: 'IP-CIDR' | 'SRC-IP-CIDR', ip: string): RuleOption {
  const mask = isIPv6(ip) ? '/128' : '/32'
  return { label: type, value: `${type},${ip}${mask}` }
}

export function getProcessDisplayName(processPath?: string, process?: string, fallback = 'System'): string {
  return extractProcessName(processPath) || process || fallback
}

export function getNetworkBadgeClass(network: string): string {
  return network.toLowerCase() === 'udp'
    ? 'border-warning/40 text-warning bg-warning/10'
    : 'border-primary/40 text-primary bg-primary/10'
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
