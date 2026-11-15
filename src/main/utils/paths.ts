import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

export interface AppPaths {
  userData: string
  mihomoDir: string
  profilesDir: string
  logsDir: string
  tasksDir: string
  coresDir: string
  sidecarDir: string
  geoFilesDir: string
  activeConfigPath: string
  settingsFilePath: string
  profilesFilePath: string
  coreBinaryPath: string
  runnerBinaryPath: string
}

let cachedPaths: AppPaths | null = null

export function resolveCoreBinaryPath(channel?: 'stable' | 'alpha'): string {
  const paths = getAppPaths()
  const ext = process.platform === 'win32' ? '.exe' : ''
  if (channel === 'alpha') {
    const alphaBinary = path.join(paths.coresDir, 'alpha', `mihomo${ext}`)
    if (existsSync(alphaBinary)) return alphaBinary
  } else if (channel === 'stable') {
    const customStableBinary = path.join(paths.coresDir, 'stable', `mihomo${ext}`)
    if (existsSync(customStableBinary)) return customStableBinary
  }
  return paths.coreBinaryPath
}

export function getAppPaths(): AppPaths {
  if (cachedPaths) return cachedPaths

  const userData = app.getPath('userData')
  const mihomoDir = path.join(userData, 'mihomo')
  const profilesDir = path.join(userData, 'profiles')
  const logsDir = path.join(userData, 'logs')
  const tasksDir = path.join(userData, 'tasks')
  const coresDir = path.join(userData, 'cores')

  // Find sidecar core directory
  const isDev = !app.isPackaged
  const sidecarDir = isDev
    ? path.join(app.getAppPath(), 'extra', 'sidecar')
    : path.join(process.resourcesPath || app.getAppPath(), 'sidecar')

  const geoFilesDir = isDev
    ? path.join(app.getAppPath(), 'extra', 'files')
    : path.join(process.resourcesPath || app.getAppPath(), 'files')

  const ext = process.platform === 'win32' ? '.exe' : ''
  const coreBinaryPath = path.join(sidecarDir, `mihomo${ext}`)
  const runnerBinaryPath = path.join(geoFilesDir, `qzyrium-run${ext}`)

  const activeConfigPath = path.join(mihomoDir, 'config.yaml')
  const settingsFilePath = path.join(userData, 'settings.json')
  const profilesFilePath = path.join(userData, 'profiles.json')

  // Ensure directories exist
  const dirs = [userData, mihomoDir, profilesDir, logsDir, tasksDir, coresDir]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  cachedPaths = {
    userData,
    mihomoDir,
    profilesDir,
    logsDir,
    tasksDir,
    coresDir,
    sidecarDir,
    geoFilesDir,
    activeConfigPath,
    settingsFilePath,
    profilesFilePath,
    coreBinaryPath,
    runnerBinaryPath
  }

  return cachedPaths
}
