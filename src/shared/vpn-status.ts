import type { CoreState } from './types'

export type VpnStatus = 'on' | 'off' | 'starting' | 'error'

export function getVpnStatus(core: CoreState): VpnStatus {
  if (core === 'starting' || core === 'error') return core
  return core === 'running' ? 'on' : 'off'
}
