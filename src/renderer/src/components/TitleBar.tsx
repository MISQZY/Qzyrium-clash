import React, { CSSProperties } from 'react'
import { Shield, ArrowUp, ArrowDown } from 'lucide-react'
import { CoreState, TrafficStats } from '@shared/types'
import { Badge } from './ui/badge'

const DRAG_STYLE = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as CSSProperties

interface TitleBarProps {
  coreStatus: CoreState
  traffic: TrafficStats
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

export const TitleBar: React.FC<TitleBarProps> = ({ coreStatus, traffic }) => {
  const isRunning = coreStatus === 'running'

  return (
    <div
      className="flex shrink-0 border-b border-border bg-card/90 backdrop-blur-sm select-none"
      style={{ height: 'calc(env(titlebar-area-height, 36px) + 1px)' }}
    >
      <div
        className="flex select-none items-center justify-between pl-3 pr-2 text-xs font-medium text-foreground"
        style={{
          ...DRAG_STYLE,
          marginLeft: 'env(titlebar-area-x, 0)',
          width: 'env(titlebar-area-width, 100%)'
        }}
      >
        {/* Left: Brand & Kernel Status */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-5.5 rounded-md bg-primary/15 text-primary border border-primary/30 shadow-[0_0_8px_var(--glow)]">
            <Shield className="size-3" />
          </div>
          <span className="font-semibold text-xs tracking-wider text-foreground">
            QZYRIUM<span className="text-primary font-bold">VPN</span>
          </span>

          <div style={NO_DRAG_STYLE} className="ml-1.5 flex items-center">
            {isRunning ? (
              <Badge variant="glow" className="capitalize text-[10px] py-0 px-2 gap-1.5">
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)] animate-pulse" />
                <span>running</span>
              </Badge>
            ) : coreStatus === 'starting' ? (
              <Badge variant="warning" className="capitalize text-[10px] py-0 px-2 gap-1.5">
                <span className="size-1.5 rounded-full bg-warning animate-ping" />
                <span>starting</span>
              </Badge>
            ) : coreStatus === 'error' ? (
              <Badge variant="destructive" className="capitalize text-[10px] py-0 px-2 gap-1.5">
                <span className="size-1.5 rounded-full bg-destructive" />
                <span>error</span>
              </Badge>
            ) : (
              <Badge variant="secondary" className="capitalize text-[10px] py-0 px-2 gap-1.5">
                <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                <span>stopped</span>
              </Badge>
            )}
          </div>
        </div>

        {/* Center/Right: Speed Monitor (visible when running) */}
        {isRunning && (
          <div
            style={NO_DRAG_STYLE}
            className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground mr-3"
          >
            <div className="flex items-center gap-1 text-accent-foreground font-medium">
              <ArrowUp className="size-3 text-primary" />
              <span>{formatSpeed(traffic.up)}</span>
            </div>
            <div className="flex items-center gap-1 text-foreground font-medium">
              <ArrowDown className="size-3 text-success" />
              <span>{formatSpeed(traffic.down)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
