import React from 'react'
import {
  ArrowUp,
  ArrowDown,
  Play,
  Square,
  RotateCw,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { CoreState, TrafficStats, TunnelMode } from '@shared/types'
import { ProfileItem } from '@shared/profile'
import { AppConfig } from '@shared/app-config'
import { ConnectionsSnapshot } from '@shared/mihomo'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

interface DashboardPageProps {
  coreStatus: CoreState
  traffic: TrafficStats
  activeProfile: ProfileItem | null
  settings: AppConfig
  connections: ConnectionsSnapshot
  onRestart: () => void
  onUpdateMode: (mode: TunnelMode) => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  coreStatus,
  traffic,
  activeProfile,
  settings,
  connections,
  onRestart,
  onUpdateMode
}) => {
  const modes: TunnelMode[] = ['rule', 'global', 'direct']
  const isRunning = coreStatus === 'running'

  const handleStartStop = async () => {
    if (!window.api) return
    if (isRunning) {
      await window.api.kernel.stop()
    } else {
      await window.api.kernel.start()
    }
  }

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-6 flex flex-col gap-5">
      {/* Top Banner: Status & Quick Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Core Status Card */}
        <Card className="col-span-2 relative overflow-hidden">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`size-12 rounded-xl flex items-center justify-center transition-colors ${
                  isRunning
                    ? 'bg-primary/15 text-primary border border-primary/30 shadow-[0_0_12px_var(--glow)]'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                {isRunning ? (
                  <CheckCircle2 className="size-6 text-primary" />
                ) : (
                  <AlertCircle className="size-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Mihomo Core</h2>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Meta Engine
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Status:{' '}
                  <span className="capitalize font-mono font-medium text-foreground">
                    {coreStatus}
                  </span>{' '}
                  | Mixed Port:{' '}
                  <span className="font-mono text-primary font-medium">
                    {settings.kernel.mixedPort}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleStartStop}
                variant={isRunning ? 'destructive' : 'glow'}
                size="sm"
                className="gap-2"
              >
                {isRunning ? (
                  <>
                    <Square className="size-3.5 fill-current" /> Stop Core
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 fill-current" /> Start Core
                  </>
                )}
              </Button>
              <Button
                onClick={onRestart}
                variant="outline"
                size="icon-sm"
                title="Restart Core"
              >
                <RotateCw className="size-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Active Profile Card */}
        <Card>
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <span className="text-xs text-muted-foreground">Active Subscription</span>
            <span className="text-sm font-semibold text-foreground truncate mt-1">
              {activeProfile?.name || 'Default Skeleton'}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[9px]">
                {activeProfile ? `type: ${activeProfile.type}` : 'builtin'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Speed Real-time Meters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Download Speed */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-success/15 text-success flex items-center justify-center border border-success/30">
                <ArrowDown className="size-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Download Rate</span>
                <div className="text-xl font-bold font-mono text-foreground tracking-tight">
                  {formatSpeed(traffic.down)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block">Session Inbound</span>
              <span className="text-xs font-mono text-foreground font-medium">
                {formatBytes(connections.downloadTotal || 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Upload Speed */}
        <Card className="hover:border-primary/40 transition-colors">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center border border-primary/30">
                <ArrowUp className="size-5" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium">Upload Rate</span>
                <div className="text-xl font-bold font-mono text-foreground tracking-tight">
                  {formatSpeed(traffic.up)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block">Session Outbound</span>
              <span className="text-xs font-mono text-foreground font-medium">
                {formatBytes(connections.uploadTotal || 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mode Selector & Routing Policy */}
      <Card>
        <CardContent className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="size-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Traffic Routing Mode</span>
            </div>
            <span className="text-xs text-muted-foreground">Rules policy for outbound traffic</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {modes.map((m) => {
              const isSelected = settings.kernel.mode === m
              return (
                <button
                  key={m}
                  onClick={() => onUpdateMode(m)}
                  className={`py-3 px-4 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 text-primary border-primary/50 shadow-[0_0_12px_var(--glow-bg)]'
                      : 'bg-card/40 text-muted-foreground border-border hover:border-border/80 hover:text-foreground'
                  }`}
                >
                  <span className="capitalize font-semibold text-xs tracking-wide">{m}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {m === 'rule' && 'Routes via domain rules'}
                    {m === 'global' && 'All traffic through proxy'}
                    {m === 'direct' && 'Bypass all proxies'}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
