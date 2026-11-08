import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

export interface AppPaths {
  userData: string
  mihomoDir: string
  profilesDir: string
  logsDir: string
  sidecarDir: string
  activeConfigPath: string
  settingsFilePath: string
  profilesFilePath: string
  coreBinaryPath: string
}

let cachedPaths: AppPaths | null = null

export function getAppPaths(): AppPaths {
  if (cachedPaths) return cachedPaths

  const userData = app.getPath('userData')
  const mihomoDir = path.join(userData, 'mihomo')
  const profilesDir = path.join(userData, 'profiles')
  const logsDir = path.join(userData, 'logs')

  // Find sidecar core directory
  const isDev = !app.isPackaged
  const sidecarDir = isDev
    ? path.join(app.getAppPath(), 'extra', 'sidecar')
    : path.join(process.resourcesPath, 'sidecar')

  const ext = process.platform === 'win32' ? '.exe' : ''
  const coreBinaryPath = path.join(sidecarDir, `mihomo${ext}`)

  const activeConfigPath = path.join(mihomoDir, 'config.yaml')
  const settingsFilePath = path.join(userData, 'settings.json')
  const profilesFilePath = path.join(userData, 'profiles.json')

  // Ensure directories exist
  const dirs = [userData, mihomoDir, profilesDir, logsDir]
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
    sidecarDir,
    activeConfigPath,
    settingsFilePath,
    profilesFilePath,
    coreBinaryPath
  }

  return cachedPaths
}
