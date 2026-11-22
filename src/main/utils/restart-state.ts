import { app } from 'electron'
import { readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from './atomicWrite'
import { getVerifiedCoreDigests, registerVerifiedCoreDigest } from './executable-security'

export interface RestartState { running: boolean; visible: boolean; elevated: boolean; coreOnly?: boolean; verifiedCoreDigests?: string[] }
const filename = () => path.join(app.getPath('userData'), 'pending-restart.json')

export function saveRestartState(state: RestartState): void {
  const verifiedCoreDigests = state.verifiedCoreDigests ?? (typeof getVerifiedCoreDigests === 'function' ? getVerifiedCoreDigests() : [])
  writeFileAtomic(filename(), JSON.stringify({ ...state, verifiedCoreDigests, createdAt: Date.now() }))
}

export function clearRestartState(): void {
  try { unlinkSync(filename()) } catch { /* No pending restart. */ }
}

export function readRestartState(): RestartState | null {
  try {
    const state = JSON.parse(readFileSync(filename(), 'utf8'))
    if (typeof state.running === 'boolean' && typeof state.visible === 'boolean' && typeof state.elevated === 'boolean'
      && Number.isFinite(state.createdAt) && Date.now() - state.createdAt >= 0 && Date.now() - state.createdAt < 10 * 60_000) {
      if (Array.isArray(state.verifiedCoreDigests) && typeof registerVerifiedCoreDigest === 'function') {
        for (const digest of state.verifiedCoreDigests) {
          if (typeof digest === 'string') registerVerifiedCoreDigest(digest)
        }
      }
      return { running: state.running, visible: state.visible, elevated: state.elevated, ...(state.coreOnly === true ? { coreOnly: true } : {}) }
    }
  } catch { /* Normal launch. */ }
  clearRestartState()
  return null
}
