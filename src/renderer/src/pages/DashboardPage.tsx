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

  const handleStartStop = async () => {
    if (!window.api) return
    if (coreStatus === 'running') {
      await window.api.kernel.stop()
    } else {
      await window.api.kernel.start()
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6 h-[calc(100vh-2.5rem)] overflow-y-auto">
      {/* Top Banner: Status & Quick Controls */}
      <div className="grid grid-cols-3 gap-4">
        {/* Core Status Card */}
        <div className="col-span-2 flex items-center justify-between p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 backdrop-blur">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                coreStatus === 'running'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {coreStatus === 'running' ? (
                <CheckCircle2 className="w-6 h-6 animate-pulse" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">Mihomo Core</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  v1.19+ (Meta)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Status: <span className="capitalize font-mono font-medium text-slate-200">{coreStatus}</span> | Mixed Port:{' '}
                <span className="font-mono text-indigo-400">{settings.kernel.mixedPort}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleStartStop}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                coreStatus === 'running'
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
              }`}
            >
              {coreStatus === 'running' ? (
                <>
                  <Square className="w-3.5 h-3.5" /> Stop
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Start
                </>
              )}
            </button>
            <button
              onClick={onRestart}
              className="p-2 rounded-lg bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Restart Core"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Profile Card */}
        <div className="flex flex-col justify-center p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 backdrop-blur">
          <span className="text-xs text-slate-400">Active Profile</span>
          <span className="text-sm font-semibold text-slate-100 truncate mt-1">
            {activeProfile?.name || 'Default Config'}
          </span>
          <span className="text-[10px] font-mono text-slate-500 mt-0.5">
            {activeProfile ? `Type: ${activeProfile.type}` : 'Internal Skeleton'}
          </span>
        </div>
      </div>

      {/* Traffic Speed Real-time Meters */}
      <div className="grid grid-cols-2 gap-4">
        {/* Download Speed */}
        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <ArrowDown className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium">Download Rate</span>
              <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">
                {formatSpeed(traffic.down)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block">Total Download</span>
            <span className="text-xs font-mono text-slate-300">
              {formatBytes(connections.downloadTotal || 0)}
            </span>
          </div>
        </div>

        {/* Upload Speed */}
        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <ArrowUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-400 font-medium">Upload Rate</span>
              <div className="text-xl font-bold font-mono text-slate-100 tracking-tight">
                {formatSpeed(traffic.up)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block">Total Upload</span>
            <span className="text-xs font-mono text-slate-300">
              {formatBytes(connections.uploadTotal || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Mode Selector & Routing Policy */}
      <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-slate-200">Routing Mode</span>
          </div>
          <span className="text-xs text-slate-500">Determines how traffic matches rules</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {modes.map((m) => {
            const isSelected = settings.kernel.mode === m
            return (
              <button
                key={m}
                onClick={() => onUpdateMode(m)}
                className={`py-3 px-4 rounded-lg flex flex-col items-center justify-center gap-1 border transition-all ${
                  isSelected
                    ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50 shadow-md'
                    : 'bg-slate-950/40 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span className="capitalize font-semibold text-xs">{m}</span>
                <span className="text-[10px] text-slate-500">
                  {m === 'rule' && 'Routes via custom rules'}
                  {m === 'global' && 'Forces all traffic through proxy'}
                  {m === 'direct' && 'Bypasses proxy completely'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
