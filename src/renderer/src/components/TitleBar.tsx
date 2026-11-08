import React from 'react'
import { Minus, Square, X, Shield, ArrowUp, ArrowDown } from 'lucide-react'
import { CoreState, TrafficStats } from '@shared/types'

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
  const handleMinimize = (): void => {
    window.api?.window.minimize()
  }

  const handleMaximize = (): void => {
    window.api?.window.maximize()
  }

  const handleClose = (): void => {
    window.api?.window.close()
  }

  const statusColor = {
    running: 'bg-emerald-500 shadow-emerald-500/50',
    starting: 'bg-amber-400 shadow-amber-400/50',
    stopped: 'bg-slate-500 shadow-slate-500/30',
    error: 'bg-rose-500 shadow-rose-500/50'
  }[coreStatus]

  return (
    <header className="window-drag-region h-10 w-full flex items-center justify-between px-3 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur select-none z-50">
      {/* Brand & Status */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
          <Shield className="w-3.5 h-3.5" />
        </div>
        <span className="font-semibold text-xs tracking-wider text-slate-200">QZYRIUM<span className="text-indigo-400">VPN</span></span>
        <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/50 text-[10px]">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor} shadow-sm animate-pulse`} />
          <span className="capitalize font-mono text-slate-300">{coreStatus}</span>
        </div>
      </div>

      {/* Speed Monitor Summary in TitleBar */}
      {coreStatus === 'running' && (
        <div className="window-no-drag flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3 text-cyan-400" />
            <span>{formatSpeed(traffic.up)}</span>
          </div>
          <div className="flex items-center gap-1">
            <ArrowDown className="w-3 h-3 text-emerald-400" />
            <span>{formatSpeed(traffic.down)}</span>
          </div>
        </div>
      )}

      {/* Window Controls */}
      <div className="window-no-drag flex items-center gap-1">
        <button
          onClick={handleMinimize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Maximize"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-rose-600/80 text-slate-400 hover:text-white transition-colors"
          title="Close to tray"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  )
}
