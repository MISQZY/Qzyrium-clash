export type CoreState = 'stopped' | 'starting' | 'running' | 'error'

export type TunnelMode = 'rule' | 'global' | 'direct'

export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'silent'

export interface TrafficStats {
  up: number
  down: number
}

export interface MemoryStats {
  inuse: number
  oslimit: number
}

export interface LogEntry {
  type: string
  payload: string
  time: string
  source?: 'app' | 'mihomo'
}

export interface MihomoVersion {
  version: string
  meta: boolean
}
