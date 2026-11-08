import React, { useState } from 'react'
import { Zap, Check, Wifi } from 'lucide-react'
import { ProxyGroup, ProxyNode } from '@shared/mihomo'

interface ProxiesPageProps {
  proxies: Record<string, ProxyNode>
  onSelectNode: (group: string, node: string) => void
}

export const ProxiesPage: React.FC<ProxiesPageProps> = ({ proxies, onSelectNode }) => {
  // Find all groups (types like 'Selector', 'URLTest', 'Fallback')
  const groupNames = Object.keys(proxies).filter((k) => {
    const item = proxies[k] as unknown as ProxyGroup
    return Array.isArray(item.all) && item.all.length > 0
  })

  const [activeGroup, setActiveGroup] = useState<string>(groupNames[0] || 'GLOBAL')
  const [testing, setTesting] = useState(false)
  const [delays, setDelays] = useState<Record<string, number>>({})

  const currentGroup = proxies[activeGroup] as unknown as ProxyGroup | undefined
  const currentNodes = currentGroup?.all || []
  const activeNow = currentGroup?.now || ''

  const handleTestLatency = async () => {
    if (!window.api || testing || currentNodes.length === 0) return
    setTesting(true)
    const newDelays: Record<string, number> = { ...delays }

    for (const nodeName of currentNodes) {
      try {
        const delay = await window.api.mihomo.testDelay(nodeName)
        newDelays[nodeName] = delay
      } catch {
        newDelays[nodeName] = -1 // timeout / error
      }
    }

    setDelays(newDelays)
    setTesting(false)
  }

  const getDelayBadge = (delay?: number) => {
    if (delay === undefined) return null
    if (delay === -1) {
      return <span className="text-[10px] font-mono text-rose-400">Timeout</span>
    }
    if (delay < 200) {
      return <span className="text-[10px] font-mono text-emerald-400">{delay} ms</span>
    }
    if (delay < 500) {
      return <span className="text-[10px] font-mono text-amber-400">{delay} ms</span>
    }
    return <span className="text-[10px] font-mono text-rose-400">{delay} ms</span>
  }

  return (
    <div className="flex flex-col gap-5 p-6 h-[calc(100vh-2.5rem)] overflow-y-auto">
      {/* Top Header & Group Selector Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Proxy Groups & Nodes</h2>
          <p className="text-xs text-slate-400">Select active proxy nodes and test server latency</p>
        </div>

        <button
          onClick={handleTestLatency}
          disabled={testing || currentNodes.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <Zap className={`w-3.5 h-3.5 ${testing ? 'animate-bounce text-amber-400' : 'text-slate-400'}`} />
          <span>{testing ? 'Testing...' : 'Test Latency'}</span>
        </button>
      </div>

      {/* Group Tabs */}
      {groupNames.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {groupNames.map((name) => (
            <button
              key={name}
              onClick={() => setActiveGroup(name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeGroup === name
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Node Cards Grid */}
      {currentNodes.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {currentNodes.map((nodeName) => {
            const isSelected = activeNow === nodeName
            const nodeData = proxies[nodeName]
            const nodeType = nodeData?.type || 'direct'
            const delay = delays[nodeName]

            return (
              <button
                key={nodeName}
                onClick={() => onSelectNode(activeGroup, nodeName)}
                className={`p-3.5 rounded-xl flex flex-col justify-between text-left border transition-all ${
                  isSelected
                    ? 'bg-indigo-600/15 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wifi className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span className="text-xs font-semibold text-slate-200 truncate">{nodeName}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60">
                  <span className="text-[10px] font-mono uppercase text-slate-400">{nodeType}</span>
                  {getDelayBadge(delay)}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl bg-slate-900/40 border border-slate-800 text-center">
          <span className="text-sm text-slate-400">No proxy nodes found</span>
          <span className="text-xs text-slate-500 mt-1">
            Import a subscription profile in the Profiles tab to load proxy nodes.
          </span>
        </div>
      )}
    </div>
  )
}
