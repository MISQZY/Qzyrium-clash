import React, { useState } from 'react'
import { Zap, Check, Wifi } from 'lucide-react'
import { ProxyGroup, ProxyNode } from '@shared/mihomo'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Card, CardContent } from '../components/ui/card'

interface ProxiesPageProps {
  proxies: Record<string, ProxyNode>
  onSelectNode: (group: string, node: string) => void
}

export const ProxiesPage: React.FC<ProxiesPageProps> = ({ proxies, onSelectNode }) => {
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
        newDelays[nodeName] = -1
      }
    }

    setDelays(newDelays)
    setTesting(false)
  }

  const renderDelayBadge = (delay?: number) => {
    if (delay === undefined) return null
    if (delay === -1) {
      return <Badge variant="destructive">Timeout</Badge>
    }
    if (delay < 200) {
      return <Badge variant="success">{delay} ms</Badge>
    }
    if (delay < 500) {
      return <Badge variant="warning">{delay} ms</Badge>
    }
    return <Badge variant="destructive">{delay} ms</Badge>
  }

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-6 flex flex-col gap-5">
      {/* Top Header & Group Selector Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Proxy Nodes</h2>
          <p className="text-xs text-muted-foreground">Select active exit node and test latency</p>
        </div>

        <Button
          onClick={handleTestLatency}
          disabled={testing || currentNodes.length === 0}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Zap className={`size-3.5 ${testing ? 'animate-bounce text-warning' : 'text-primary'}`} />
          <span>{testing ? 'Testing...' : 'Test Latency'}</span>
        </Button>
      </div>

      {/* Group Tabs */}
      {groupNames.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
          {groupNames.map((name) => {
            const isCurrent = activeGroup === name
            return (
              <button
                key={name}
                onClick={() => setActiveGroup(name)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground shadow-xs shadow-primary/20'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>
      )}

      {/* Node Cards Grid */}
      {currentNodes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {currentNodes.map((nodeName) => {
            const isSelected = activeNow === nodeName
            const nodeData = proxies[nodeName]
            const nodeType = nodeData?.type || 'direct'
            const delay = delays[nodeName]

            return (
              <Card
                key={nodeName}
                onClick={() => onSelectNode(activeGroup, nodeName)}
                className={`cursor-pointer transition-all hover:border-primary/50 ${
                  isSelected
                    ? 'border-primary/60 bg-primary/10 shadow-[0_0_12px_var(--glow-bg)]'
                    : 'bg-card/70'
                }`}
              >
                <CardContent className="p-3.5 flex flex-col justify-between h-full gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Wifi
                        className={`size-3.5 shrink-0 ${
                          isSelected ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      />
                      <span className="text-xs font-semibold text-foreground truncate">
                        {nodeName}
                      </span>
                    </div>
                    {isSelected && <Check className="size-3.5 text-primary shrink-0" />}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <Badge variant="outline" className="text-[9px] uppercase font-mono">
                      {nodeType}
                    </Badge>
                    {renderDelayBadge(delay)}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="p-12 text-center flex flex-col items-center justify-center">
          <span className="text-sm font-medium text-foreground">No proxy nodes available</span>
          <span className="text-xs text-muted-foreground mt-1">
            Import a subscription in the Profiles tab to populate proxy nodes.
          </span>
        </Card>
      )}
    </div>
  )
}
