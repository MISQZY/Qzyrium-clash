import type { ConnectionItem } from '@shared/mihomo'
import { extractProcessName, type ProcessGroup } from './connections'

export type ConnectionProtocol = 'all' | 'tcp' | 'udp'
export type ConnectionSort = 'traffic' | 'time' | 'process'
export const CONNECTION_BATCH_SIZE = 100

export function filterConnections(items: readonly ConnectionItem[], query: string, protocol: ConnectionProtocol): ConnectionItem[] {
  const q = query.toLowerCase().trim()
  return items.filter(item => {
    if (protocol !== 'all' && item.metadata.network.toLowerCase() !== protocol) return false
    if (!q) return true
    const process = extractProcessName(item.metadata.processPath) || item.metadata.process || ''
    return `${process} ${item.metadata.host || ''} ${item.metadata.destinationIP || ''} ${item.metadata.processPath || ''} ${item.rule || ''} ${item.chains.join(' ')}`
      .toLowerCase().includes(q)
  })
}

/** Groups keep source order within each process; only the group list is sorted. */
export function groupConnections(items: readonly ConnectionItem[], sort: ConnectionSort, systemLabel: string): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>()
  for (const item of items) {
    const rawPath = item.metadata.processPath || item.metadata.process || ''
    const name = item.metadata.process || extractProcessName(item.metadata.processPath) ||
      (item.metadata.sourceIP ? `IP: ${item.metadata.sourceIP}` : '') || systemLabel
    const key = rawPath || item.metadata.process || name || 'system'
    const start = new Date(item.start).getTime()
    const existing = groups.get(key)
    if (existing) {
      existing.connections.push(item)
      existing.activeCount++
      existing.totalUpload += item.upload
      existing.totalDownload += item.download
      if (start > existing.latestStart) existing.latestStart = start
    } else {
      groups.set(key, { key, name, path: rawPath, connections: [item], activeCount: 1,
        totalUpload: item.upload, totalDownload: item.download, latestStart: start })
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (sort === 'traffic') return b.totalDownload + b.totalUpload - (a.totalDownload + a.totalUpload)
    if (sort === 'time') return b.latestStart - a.latestStart
    return a.name.localeCompare(b.name)
  })
}

export function sortConnections(items: readonly ConnectionItem[], sort: ConnectionSort, systemLabel: string): ConnectionItem[] {
  return [...items].sort((a, b) => {
    if (sort === 'traffic') return b.download + b.upload - (a.download + a.upload)
    if (sort === 'time') return new Date(b.start).getTime() - new Date(a.start).getTime()
    const nameA = extractProcessName(a.metadata.processPath) || a.metadata.process || systemLabel
    const nameB = extractProcessName(b.metadata.processPath) || b.metadata.process || systemLabel
    return nameA.localeCompare(nameB)
  })
}
