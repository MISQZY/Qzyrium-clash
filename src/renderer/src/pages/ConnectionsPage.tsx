import React from 'react'
import { Trash2, Radio } from 'lucide-react'
import { ConnectionsSnapshot } from '@shared/mihomo'

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
    if (!window.api || !confirm('Close all active connections?')) return
    await window.api.mihomo.closeAllConnections()
    onRefresh()
  }

  const handleCloseSingle = async (id: string) => {
    if (!window.api) return
    await window.api.mihomo.closeConnection(id)
    onRefresh()
  }

  return (
    <div className="flex flex-col gap-5 p-6 h-[calc(100vh-2.5rem)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-100">Active Connections</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {connList.length} sockets
            </span>
          </div>
          <p className="text-xs text-slate-400">Live network sessions routed through Mihomo core</p>
        </div>

        <button
          onClick={handleCloseAll}
          disabled={connList.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Close All</span>
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 text-[11px] font-medium text-slate-400">
          <span className="col-span-4">Host / Destination</span>
          <span className="col-span-2">Network / Process</span>
          <span className="col-span-2">Traffic</span>
          <span className="col-span-3">Rule / Chain</span>
          <span className="col-span-1 text-right">Action</span>
        </div>

        <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
          {connList.length > 0 ? (
            connList.map((c) => {
              const host = c.metadata?.host || c.metadata?.destinationIP || 'unknown'
              const port = c.metadata?.destinationPort || ''
              const netType = c.metadata?.network || 'TCP'
              const processName = c.metadata?.processPath ? c.metadata.processPath.split(/[\\/]/).pop() : 'System'
              const rule = c.rule || 'Direct'
              const chainStr = c.chains ? c.chains.join(' → ') : 'DIRECT'

              return (
                <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-xs hover:bg-slate-800/40 transition-colors">
                  <div className="col-span-4 flex flex-col min-w-0">
                    <span className="font-semibold text-slate-200 truncate">{host}</span>
                    <span className="text-[10px] text-slate-500 font-mono">Port: {port}</span>
                  </div>

                  <div className="col-span-2 flex flex-col">
                    <span className="text-[11px] font-mono uppercase text-indigo-400">{netType}</span>
                    <span className="text-[10px] text-slate-400 truncate">{processName}</span>
                  </div>

                  <div className="col-span-2 flex flex-col font-mono text-[11px]">
                    <span className="text-emerald-400">↓ {formatBytes(c.download)}</span>
                    <span className="text-cyan-400">↑ {formatBytes(c.upload)}</span>
                  </div>

                  <div className="col-span-3 flex flex-col min-w-0">
                    <span className="text-[11px] text-slate-300 truncate">{chainStr}</span>
                    <span className="text-[10px] text-slate-500 truncate">{rule}</span>
                  </div>

                  <div className="col-span-1 text-right">
                    <button
                      onClick={() => handleCloseSingle(c.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Terminate session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Radio className="w-7 h-7 text-slate-600 mb-2" />
              <span className="text-xs text-slate-400">No active network connections</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
