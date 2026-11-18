import { execFileSync, execFile } from 'child_process'
import { randomUUID } from 'node:crypto'
import path from 'path'
import os from 'os'
import { writeFileSync, unlinkSync } from 'fs'
import { app } from 'electron'
import { logger } from './logger'
import { checkElevateTask, tryRunElevateTask } from './elevate-task'
import { getSystemBinary } from './system-binaries'

let cachedElevated: boolean | null = null

export function isProcessElevated(): boolean {
  if (cachedElevated !== null) return cachedElevated

  if (process.platform !== 'win32') {
    cachedElevated = process.getuid ? process.getuid() === 0 : false
    return cachedElevated
  }

  try {
    const systemRoot = process.env?.SystemRoot
    const fltmc = systemRoot
      ? path.join(systemRoot, 'System32', 'fltmc.exe')
      : 'fltmc.exe'
    execFileSync(fltmc, [], { stdio: 'ignore', windowsHide: true })
    cachedElevated = true
    return true
  } catch {
    // fltmc fails with exit code 1 when not elevated
  }

  try {
    const systemRoot = process.env?.SystemRoot
    const whoami = systemRoot
      ? path.join(systemRoot, 'System32', 'whoami.exe')
      : 'whoami.exe'
    const out = execFileSync(whoami, ['/groups'], { encoding: 'utf8', windowsHide: true })
    cachedElevated = out.includes('S-1-16-12288') || out.includes('S-1-16-16384')
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
        logger.warn('Administrator restart is supported only on Windows. On Linux, configure Mihomo network capabilities with setcap/polkit.')
        resolve(false)
        return
      }

      const execPath = process.execPath
      const isPackaged = electronApp.isPackaged
      const workingDir = isPackaged ? path.dirname(execPath) : (electronApp.getAppPath() || process.cwd())
      const appUserData = electronApp.getPath('userData')

      const filteredArgs = (isPackaged ? process.argv.slice(1) : process.argv.slice(2))
        .filter((a: string) => !a.startsWith('--admin-restart'))
        .map((a: string) => {
          if (a.startsWith('--user-data-dir=')) {
            return `--user-data-dir=${appUserData}`
          }
          return a
        })

      const rawArgs = isPackaged
        ? filteredArgs
        : [electronApp.getAppPath(), ...filteredArgs]

      if (!isPackaged && !rawArgs.some((a: string) => a.startsWith('--user-data-dir='))) {
        rawArgs.push(`--user-data-dir=${appUserData}`)
      }

      const args = [...rawArgs, `--admin-restart=${process.pid}`]

      // Release single-instance lock before launching elevated instance to avoid collision
      if (typeof electronApp.releaseSingleInstanceLock === 'function') {
        electronApp.releaseSingleInstanceLock()
      }

      // Try launching via the Task Scheduler bypass task first (no UAC prompt, no PowerShell)
      // Only for packaged applications: in development, the scheduled task points to the installed app!
      if (isPackaged) {
        try {
          if (checkElevateTask() && tryRunElevateTask(args)) {
            electronApp.exit(0)
            resolve(true)
            return
          }
        } catch (taskErr) {
          logger.warn(`Elevate task launch attempt failed, falling back to direct UAC elevation: ${String(taskErr)}`)
        }
      }

      // Native UAC elevation via Windows Script Host (prompts UAC for the executable itself, not PowerShell)
      const tempDir = (typeof electronApp.getPath === 'function' && electronApp.getPath('temp')) || process.env?.TEMP || os.tmpdir()
      const vbsPath = path.join(tempDir, `elevate_${process.pid}_${randomUUID()}.vbs`)
      // eslint-disable-next-line no-control-regex
      const sanitizeArg = (a: string) => a.replace(/[\x00-\x1f\x7f]/g, '')
      const cleanArgs = args.map(sanitizeArg).filter((a: string) => a.length > 0)
      const escapedTarget = sanitizeArg(execPath).replace(/"/g, '""')
      const escapedDir = sanitizeArg(workingDir).replace(/"/g, '""')
      const escapedArgs = cleanArgs
        .map((a: string) => {
          const esc = a.replace(/"/g, '""')
          return /[\s"]/.test(a) ? `""${esc}""` : esc
        })
        .join(' ')

      const vbsScript = `Set s = CreateObject("Shell.Application")\ns.ShellExecute "${escapedTarget}", "${escapedArgs}", "${escapedDir}", "runas", 1\n`

      try {
        writeFileSync(vbsPath, vbsScript, { encoding: 'utf8', flag: 'wx' })
      } catch (writeErr) {
        logger.error('Failed to create elevation script', writeErr)
        if (typeof electronApp.requestSingleInstanceLock === 'function') {
          electronApp.requestSingleInstanceLock()
        }
        resolve(false)
        return
      }

      execFile(
        getSystemBinary('wscript.exe'),
        ['//nologo', vbsPath],
        { windowsHide: true },
        (err) => {
          try { unlinkSync(vbsPath) } catch { /* ignore */ }
          if (err) {
            logger.warn(`Failed to relaunch process as Administrator or UAC was declined: ${String(err)}`)
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
      if (app && typeof app.requestSingleInstanceLock === 'function') {
        app.requestSingleInstanceLock()
      }
      logger.error('Failed to relaunch process as Administrator', err)
      resolve(false)
    }
  })
}
