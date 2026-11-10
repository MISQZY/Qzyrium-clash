import { execFileSync, execFile } from 'child_process'
import path from 'path'
import { app } from 'electron'
import { logger } from './logger'

let cachedElevated: boolean | null = null

export function isProcessElevated(): boolean {
  if (cachedElevated !== null) return cachedElevated

  if (process.platform !== 'win32') {
    cachedElevated = process.getuid ? process.getuid() === 0 : false
    return cachedElevated
  }

  try {
    // Check the process token; `net session` also fails when the Server service is stopped.
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()); if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }'
    ], { stdio: 'ignore', windowsHide: true })
    cachedElevated = true
  } catch {
    cachedElevated = false
  }

  return cachedElevated
}

export function restartAsAdmin(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const electronApp = app
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
      const rawArgs = isPackaged
        ? process.argv.slice(1).filter((a: string) => !a.startsWith('--admin-restart'))
        : [electronApp.getAppPath(), ...process.argv.slice(2).filter((a: string) => !a.startsWith('--admin-restart'))]
      const args = [...rawArgs, `--admin-restart=${process.pid}`]

      const escapedExecPath = execPath.replace(/'/g, "''")
      const escapedWorkingDir = workingDir.replace(/'/g, "''")
      const escapedArgs = args
        .map((a: string) => {
          const esc = a.replace(/'/g, "''")
          return /[\s"]/.test(a) ? `'"${esc}"'` : `'${esc}'`
        })
        .join(', ')

      const script = `
$ErrorActionPreference = 'Stop'
$filePath = '${escapedExecPath}'
$workingDir = '${escapedWorkingDir}'
$argList = @(${escapedArgs})
Start-Process -FilePath $filePath -WorkingDirectory $workingDir -ArgumentList $argList -Verb RunAs -WindowStyle Normal -ErrorAction Stop
`
      const encoded = Buffer.from(script, 'utf16le').toString('base64')

      // Release single-instance lock before launching elevated instance to avoid collision
      if (typeof electronApp.releaseSingleInstanceLock === 'function') {
        electronApp.releaseSingleInstanceLock()
      }

      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
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
      if (app) app.requestSingleInstanceLock()
      logger.error('Failed to relaunch process as Administrator', err)
      resolve(false)
    }
  })
}
