import { app } from 'electron'
import { readFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from './atomicWrite'

export interface RestartState { running: boolean; visible: boolean; elevated: boolean }
const filename = () => path.join(app.getPath('userData'), 'pending-restart.json')

export function saveRestartState(state: RestartState): void {
  writeFileAtomic(filename(), JSON.stringify({ ...state, createdAt: Date.now() }))
}

export function clearRestartState(): void {
  try { unlinkSync(filename()) } catch { /* No pending restart. */ }
}

export function readRestartState(): RestartState | null {
  try {
    const state = JSON.parse(readFileSync(filename(), 'utf8'))
    if (typeof state.running === 'boolean' && typeof state.visible === 'boolean' && typeof state.elevated === 'boolean'
      && Number.isFinite(state.createdAt) && Date.now() - state.createdAt >= 0 && Date.now() - state.createdAt < 10 * 60_000) {
      return { running: state.running, visible: state.visible, elevated: state.elevated }
    }
  } catch { /* Normal launch. */ }
  clearRestartState()
  return null
}
