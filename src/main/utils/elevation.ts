import { execFileSync, execFile } from 'child_process'
import path from 'path'
import os from 'os'
import { writeFileSync, unlinkSync } from 'fs'
import { app } from 'electron'
import { logger } from './logger'
import { checkElevateTask, tryRunElevateTask } from './elevate-task'

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

      // Release single-instance lock before launching elevated instance to avoid collision
      if (typeof electronApp.releaseSingleInstanceLock === 'function') {
        electronApp.releaseSingleInstanceLock()
      }

      // Try launching via the Task Scheduler bypass task first (no UAC prompt, no PowerShell)
      try {
        if (checkElevateTask() && tryRunElevateTask(args)) {
          electronApp.exit(0)
          resolve(true)
          return
        }
      } catch (taskErr) {
        logger.warn(`Elevate task launch attempt failed, falling back to direct UAC elevation: ${String(taskErr)}`)
      }

      // Native UAC elevation via Windows Script Host (prompts UAC for the executable itself, not PowerShell)
      const tempDir = (typeof electronApp.getPath === 'function' && electronApp.getPath('temp')) || process.env?.TEMP || os.tmpdir()
      const vbsPath = path.join(tempDir, `elevate_${process.pid}_${Date.now()}.vbs`)
      const escapedTarget = execPath.replace(/"/g, '""')
      const escapedDir = workingDir.replace(/"/g, '""')
      const escapedArgs = args
        .map((a: string) => {
          const esc = a.replace(/"/g, '""')
          return /[\s"]/.test(a) ? `""${esc}""` : esc
        })
        .join(' ')

      const vbsScript = `Set s = CreateObject("Shell.Application")\ns.ShellExecute "${escapedTarget}", "${escapedArgs}", "${escapedDir}", "runas", 1\n`

      try {
        writeFileSync(vbsPath, vbsScript, 'utf8')
      } catch (writeErr) {
        logger.error('Failed to create elevation script', writeErr)
        if (typeof electronApp.requestSingleInstanceLock === 'function') {
          electronApp.requestSingleInstanceLock()
        }
        resolve(false)
        return
      }

      execFile(
        'wscript.exe',
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
