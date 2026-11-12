import { app } from 'electron'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from './atomicWrite'
import { logger } from './logger'

const filename = () => path.join(app.getPath('userData'), 'elevation-state.json')

export function readElevationState(): boolean {
  try {
    return JSON.parse(readFileSync(filename(), 'utf8')).enabled === true
  } catch {
    return false
  }
}

// Persist only after an elevated process actually starts, never before UAC consent.
export function rememberElevation(): void {
  if (readElevationState()) return
  try {
    const file = filename()
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileAtomic(file, JSON.stringify({ enabled: true }))
  } catch (error) {
    logger.warn(`Could not save administrator launch preference: ${String(error)}`)
  }
}
