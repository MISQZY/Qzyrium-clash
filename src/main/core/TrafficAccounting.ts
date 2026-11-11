import type { ConnectionItem, ConnectionsSnapshot } from '@shared/mihomo'

/** Accounts only observed bytes; closed connections keep totals as a lower bound. */
export class TrafficAccounting {
  private directDownloadTotal = 0
  private directUploadTotal = 0
  private vpnDownloadTotal = 0
  private vpnUploadTotal = 0
  private lastSeenDownloadTotal = 0
  private activeTrackedConns = new Map<string, { download: number; upload: number; isDirect: boolean }>()

  reset(): void {
    this.directDownloadTotal = 0
    this.directUploadTotal = 0
    this.vpnDownloadTotal = 0
    this.vpnUploadTotal = 0
    this.lastSeenDownloadTotal = 0
    if (this.activeTrackedConns) {
      this.activeTrackedConns.clear()
    } else {
      this.activeTrackedConns = new Map()
    }
  }

  sample(snapshot: ConnectionsSnapshot): ConnectionsSnapshot {

    if (snapshot.downloadTotal < this.lastSeenDownloadTotal) {
      this.reset()
    }
    this.lastSeenDownloadTotal = snapshot.downloadTotal

    if (!this.activeTrackedConns) this.activeTrackedConns = new Map()
    const currentIds = new Set<string>()
    for (const conn of snapshot.connections) {
      currentIds.add(conn.id)
      const isDirect = this.isDirectConnection(conn)
      const prev = this.activeTrackedConns.get(conn.id)
      const dlDelta = prev ? Math.max(0, conn.download - prev.download) : conn.download
      const ulDelta = prev ? Math.max(0, conn.upload - prev.upload) : conn.upload
      if (isDirect) {
        this.directDownloadTotal += dlDelta
        this.directUploadTotal += ulDelta
      } else {
        this.vpnDownloadTotal += dlDelta
        this.vpnUploadTotal += ulDelta
      }
      this.activeTrackedConns.set(conn.id, {
        download: conn.download,
        upload: conn.upload,
        isDirect
      })
    }

    for (const id of this.activeTrackedConns.keys()) {
      if (!currentIds.has(id)) {
        this.activeTrackedConns.delete(id)
      }
    }

    const directDownloadTotal = Math.min(this.directDownloadTotal, snapshot.downloadTotal)
    const directUploadTotal = Math.min(this.directUploadTotal, snapshot.uploadTotal)

    return {
      ...snapshot,
      directDownloadTotal,
      directUploadTotal,
      // /connections forgets closed connections. Attribute only bytes actually
      // observed on a proxy chain; unobserved traffic must never become VPN bytes.
      vpnDownloadTotal: Math.min(this.vpnDownloadTotal, snapshot.downloadTotal),
      vpnUploadTotal: Math.min(this.vpnUploadTotal, snapshot.uploadTotal),
      vpnTrafficIsLowerBound: true
    }
  }

  private isDirectConnection(conn: ConnectionItem): boolean {
    if (conn.rule?.toUpperCase() === 'DIRECT' || conn.rulePayload?.toUpperCase() === 'DIRECT') {
      return true
    }
    if (!conn.chains || conn.chains.length === 0) {
      return true
    }
    const upperChains = conn.chains.map((c) => c.toUpperCase())
    return (
      upperChains.includes('DIRECT') ||
      upperChains[upperChains.length - 1] === 'DIRECT' ||
      upperChains.every((c) => c === 'DIRECT' || c === 'REJECT')
    )
  }

}
