import React from 'react'
import { Trash2, Radio } from 'lucide-react'
import { ConnectionsSnapshot } from '@shared/mihomo'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'

interface ConnectionsPageProps {
  connections: ConnectionsSnapshot
  onRefresh: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const ConnectionsPage: React.FC<ConnectionsPageProps> = ({ connections, onRefresh }) => {
  const connList = connections.connections || []

  const handleCloseAll = async () => {
    if (!window.api || !confirm('Terminate all active sessions?')) return
    await window.api.mihomo.closeAllConnections()
    onRefresh()
  }

  const handleCloseSingle = async (id: string) => {
    if (!window.api) return
    await window.api.mihomo.closeConnection(id)
    onRefresh()
  }

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Active Sessions</h2>
            <Badge variant="outline" className="font-mono">
              {connList.length} sockets
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">Live network connections routed through Mihomo</p>
        </div>

        <Button
          onClick={handleCloseAll}
          disabled={connList.length === 0}
          variant="destructive"
          size="sm"
          className="gap-2"
        >
          <Trash2 className="size-3.5" />
          <span>Close All</span>
        </Button>
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-[11px] font-medium text-muted-foreground">
          <span className="col-span-4">Host / Destination</span>
          <span className="col-span-2">Network / App</span>
          <span className="col-span-2">Transfer</span>
          <span className="col-span-3">Chain & Rule</span>
          <span className="col-span-1 text-right">Action</span>
        </div>

        <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
          {connList.length > 0 ? (
            connList.map((c) => {
              const host = c.metadata?.host || c.metadata?.destinationIP || 'unknown'
              const port = c.metadata?.destinationPort || ''
              const netType = c.metadata?.network || 'TCP'
              const processName = c.metadata?.processPath
                ? c.metadata.processPath.split(/[\\/]/).pop()
                : 'System'
              const rule = c.rule || 'Direct'
              const chainStr = c.chains ? c.chains.join(' → ') : 'DIRECT'

              return (
                <div
                  key={c.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-xs hover:bg-muted/30 transition-colors"
                >
                  <div className="col-span-4 flex flex-col min-w-0">
                    <span className="font-medium text-foreground truncate">{host}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">Port: {port}</span>
                  </div>

                  <div className="col-span-2 flex flex-col">
                    <span className="text-[11px] font-mono uppercase text-primary font-semibold">
                      {netType}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">{processName}</span>
                  </div>

                  <div className="col-span-2 flex flex-col font-mono text-[11px]">
                    <span className="text-success">↓ {formatBytes(c.download)}</span>
                    <span className="text-primary">↑ {formatBytes(c.upload)}</span>
                  </div>

                  <div className="col-span-3 flex flex-col min-w-0">
                    <span className="text-[11px] text-foreground truncate">{chainStr}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{rule}</span>
                  </div>

                  <div className="col-span-1 text-right">
                    <button
                      onClick={() => handleCloseSingle(c.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title="Terminate session"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Radio className="size-7 text-muted-foreground/40 mb-2" />
              <span className="text-xs text-muted-foreground">No active sockets found</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
