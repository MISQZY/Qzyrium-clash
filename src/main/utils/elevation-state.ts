import { app } from 'electron'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from './atomicWrite'
import { logger } from './logger'

const filename = () => path.join(app.getPath('userData'), 'elevation-state.json')

export function readElevationState(): boolean {
  try {
    const data = JSON.parse(readFileSync(filename(), 'utf8'))
    if (data.enabled !== true) return false
    if (typeof data.attemptAt === 'number' && Date.now() - data.attemptAt < 15_000) {
      clearElevationState()
      logger.warn('Previous elevate task launch did not start elevated process. Resetting elevation state to prevent startup loop.')
      return false
    }
    return true
  } catch {
    return false
  }
}

export function recordElevationAttempt(): void {
  try {
    const file = filename()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileAtomic(file, JSON.stringify({ enabled: true, attemptAt: Date.now() }))
  } catch (error) {
    logger.warn(`Could not record administrator launch attempt: ${String(error)}`)
  }
}

export function clearElevationState(): void {
  try {
    const file = filename()
    writeFileAtomic(file, JSON.stringify({ enabled: false }))
  } catch (error) {
    logger.warn(`Could not clear administrator launch preference: ${String(error)}`)
  }
}

// Persist only after an elevated process actually starts, never before UAC consent.
export function rememberElevation(): void {
  try {
    const file = filename()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileAtomic(file, JSON.stringify({ enabled: true }))
  } catch (error) {
    logger.warn(`Could not save administrator launch preference: ${String(error)}`)
  }
}
