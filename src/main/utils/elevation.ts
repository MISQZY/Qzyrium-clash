import { execFileSync, execFile } from 'child_process'
import path from 'path'

let cachedElevated: boolean | null = null

export function isProcessElevated(): boolean {
  if (cachedElevated !== null) return cachedElevated

  if (process.platform !== 'win32') {
    cachedElevated = process.getuid ? process.getuid() === 0 : false
    return cachedElevated
  }

  try {
    // 'net session' exits with 0 if elevated, 2 if not elevated
    execFileSync('net.exe', ['session'], { stdio: 'ignore', windowsHide: true })
    cachedElevated = true
  } catch {
    cachedElevated = false
  }

  return cachedElevated
}

export function restartAsAdmin(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      // Dynamically resolve Electron app to support both Electron runtime and test runners
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron')
      const electronApp = electron.app || electron.default?.app
      if (!electronApp) {
        resolve(false)
        return
      }

      if (process.platform !== 'win32') {
        electronApp.relaunch()
        electronApp.exit(0)
        resolve(true)
        return
      }

      const execPath = process.execPath
      const workingDir = path.dirname(execPath)
      const isPackaged = electronApp.isPackaged
      const args = isPackaged ? process.argv.slice(1) : [electronApp.getAppPath(), ...process.argv.slice(2)]
      const escapedExecPath = execPath.replace(/'/g, "''")
      const escapedWorkingDir = workingDir.replace(/'/g, "''")
      const escapedArgs = args.map((arg: string) => `'${arg.replace(/'/g, "''")}'`).join(', ')

      const psCommand = args.length > 0
        ? `Start-Process -FilePath '${escapedExecPath}' -WorkingDirectory '${escapedWorkingDir}' -ArgumentList @(${escapedArgs}) -Verb RunAs`
        : `Start-Process -FilePath '${escapedExecPath}' -WorkingDirectory '${escapedWorkingDir}' -Verb RunAs`

      // Release single-instance lock before launching elevated instance to avoid collision
      if (typeof electronApp.releaseSingleInstanceLock === 'function') {
        electronApp.releaseSingleInstanceLock()
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('./logger')

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
        { windowsHide: true },
        (err) => {
          if (err) {
            logger.warn(`Failed to relaunch process as Administrator or UAC was declined: ${String(err)}`)
            // Restore single instance lock if elevation failed or was canceled by user
            if (typeof electronApp.requestSingleInstanceLock === 'function') {
              electronApp.requestSingleInstanceLock()
            }
            resolve(false)
            return
          }

          electronApp.exit(0)
          resolve(true)
        }
      )
    } catch (err) {
      console.error('Failed to relaunch process as Administrator', err)
      resolve(false)
    }
  })
}
