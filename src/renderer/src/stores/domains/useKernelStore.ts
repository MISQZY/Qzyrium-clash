import { useState, useCallback } from 'react'
import type { CoreState } from '@shared/types'
import type { StoreCoordinator } from './types'

export interface KernelStore {
  coreStatus: CoreState
  setCoreStatus: React.Dispatch<React.SetStateAction<CoreState>>
  sessionStartedAt: number | null
  setSessionStartedAt: React.Dispatch<React.SetStateAction<number | null>>
  restartKernel: () => Promise<boolean>
  toggleKernel: () => Promise<boolean>
}

export function useKernelStore(coord: Pick<StoreCoordinator, 'perform'>): KernelStore {
  const [coreStatus, setCoreStatus] = useState<CoreState>('stopped')
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)

  const restartKernel = useCallback(() => {
    return coord.perform(() => window.api.kernel.restart())
  }, [coord])

  const toggleKernel = useCallback(() => {
    return coord.perform(() =>
      coreStatus === 'running' ? window.api.kernel.stop() : window.api.kernel.start()
    )
  }, [coord, coreStatus])

  return {
    coreStatus,
    setCoreStatus,
    sessionStartedAt,
    setSessionStartedAt,
    restartKernel,
    toggleKernel
  }
}
