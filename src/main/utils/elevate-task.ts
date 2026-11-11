import { execFileSync } from 'child_process'
import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { randomUUID } from 'node:crypto'
import path from 'path'
import { app } from 'electron'
import { getAppPaths } from './paths'
import { logger } from './logger'

export const ELEVATE_TASK_NAME = 'Qzyrium-clash-run-v2'
const LEGACY_TASK_NAME = 'Qzyrium-clash-run'

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getElevateTaskXml(runnerPath: string, appPath: string, paramPath: string): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers />
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>3</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(runnerPath)}</Command>
      <Arguments>${escapeXml(`"${appPath}" "${paramPath}"`)}</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

export function createElevateTaskSync(): boolean {
  if (process.platform !== 'win32') return false
  let taskXmlPath: string | undefined
  try {
    const paths = getAppPaths()
    const taskDir = paths.tasksDir
    const targetRunner = paths.runnerBinaryPath

    // Never execute a copy from userData. The bundled helper checks the entire
    // installation's ownership/ACLs before we register a privileged action.
    deleteTask(LEGACY_TASK_NAME)
    if (!existsSync(targetRunner)) {
      logger.warn(`Elevate task runner not found at ${targetRunner}`)
      return false
    }

    if (!app.isPackaged) return false
    execFileSync(targetRunner, ['--check-install', process.execPath], { windowsHide: true, timeout: 10000, stdio: 'pipe' })
    // schtasks reads XML after this write. Keep it in the verified protected
    // installation too, so a non-admin cannot replace the action before import.
    taskXmlPath = path.join(path.dirname(targetRunner), `.elevate-${randomUUID()}.xml`)
    const xmlContent = getElevateTaskXml(targetRunner, process.execPath, path.join(taskDir, 'param.txt'))
    writeFileSync(taskXmlPath, Buffer.from(`\ufeff${xmlContent}`, 'utf16le'), { flag: 'wx' })

    const schtasks = process.env?.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'schtasks.exe')
      : 'schtasks.exe'

    execFileSync(schtasks, ['/create', '/tn', ELEVATE_TASK_NAME, '/xml', taskXmlPath, '/f'], {
      windowsHide: true,
      stdio: 'pipe'
    })
    logger.info(`Elevated task "${ELEVATE_TASK_NAME}" registered successfully`)
    return true
  } catch (err) {
    logger.warn(`Could not create elevate task "${ELEVATE_TASK_NAME}": ${String(err)}`)
    return false
  } finally {
    if (taskXmlPath) {
      try { unlinkSync(taskXmlPath) } catch { /* Registration may fail before creating the file. */ }
    }
  }
}

export function tryRunElevateTask(args: string[] = []): boolean {
  if (process.platform !== 'win32') return false
  try {
    const paths = getAppPaths()
    const taskDir = paths.tasksDir
    const paramPath = path.join(taskDir, 'param.txt')

    // The privileged runner independently enforces this allowlist. Arbitrary
    // Electron switches must never cross the elevation boundary.
    const cleanArgs = args.filter((arg) => /^--admin-restart=\d+$/.test(arg) || /^(clash|qzyrium|mihomo):\/\/[^\r\n"]+$/i.test(arg))
    writeFileSync(paramPath, cleanArgs.join('\n'), 'utf8')

    const schtasks = process.env?.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'schtasks.exe')
      : 'schtasks.exe'

    execFileSync(schtasks, ['/run', '/tn', ELEVATE_TASK_NAME], {
      windowsHide: true,
      stdio: 'pipe'
    })
    logger.info(`Launched elevated instance via Task Scheduler task "${ELEVATE_TASK_NAME}"`)
    return true
  } catch (err) {
    logger.warn(`Failed to run task "${ELEVATE_TASK_NAME}": ${String(err)}`)
    return false
  }
}

export function checkElevateTask(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const schtasks = process.env?.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'schtasks.exe')
      : 'schtasks.exe'

    execFileSync(schtasks, ['/query', '/tn', ELEVATE_TASK_NAME], {
      windowsHide: true,
      stdio: 'pipe'
    })
    return true
  } catch {
    return false
  }
}

function deleteTask(name: string): void {
  if (process.platform !== 'win32') return
  try {
    const schtasks = process.env?.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'schtasks.exe')
      : 'schtasks.exe'

    execFileSync(schtasks, ['/delete', '/tn', name, '/f'], {
      windowsHide: true,
      stdio: 'pipe'
    })
  } catch {
    // Ignore deletion errors
  }
}

export function deleteElevateTask(): void {
  deleteTask(ELEVATE_TASK_NAME)
  deleteTask(LEGACY_TASK_NAME)
}
