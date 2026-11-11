import { execSync } from 'child_process'
import { copyFileSync, existsSync, writeFileSync } from 'fs'
import path from 'path'
import { app } from 'electron'
import { getAppPaths } from './paths'
import { logger } from './logger'

export const ELEVATE_TASK_NAME = 'Qzyrium-clash-run'

function getElevateTaskXml(runnerPath: string, appPath: string): string {
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
      <Command>"${runnerPath}"</Command>
      <Arguments>"${appPath}"</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

export function createElevateTaskSync(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const paths = getAppPaths()
    const taskDir = paths.tasksDir
    const sourceRunner = paths.runnerBinaryPath
    const targetRunner = path.join(taskDir, 'qzyrium-run.exe')
    const taskXmlPath = path.join(taskDir, `${ELEVATE_TASK_NAME}.xml`)

    if (existsSync(sourceRunner)) {
      copyFileSync(sourceRunner, targetRunner)
    }

    if (!existsSync(targetRunner)) {
      logger.warn(`Elevate task runner not found at ${targetRunner}`)
      return false
    }

    const xmlContent = getElevateTaskXml(targetRunner, process.execPath)
    writeFileSync(taskXmlPath, Buffer.from(`\ufeff${xmlContent}`, 'utf16le'))

    const schtasks = process.env?.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'schtasks.exe')
      : 'schtasks.exe'

    execSync(`"${schtasks}" /create /tn "${ELEVATE_TASK_NAME}" /xml "${taskXmlPath}" /f`, {
      windowsHide: true,
      stdio: 'pipe'
    })
    logger.info(`Elevated task "${ELEVATE_TASK_NAME}" registered successfully`)
    return true
  } catch (err) {
    logger.warn(`Could not create elevate task "${ELEVATE_TASK_NAME}": ${String(err)}`)
    return false
  }
}

export function tryRunElevateTask(args: string[] = []): boolean {
  if (process.platform !== 'win32') return false
  try {
    const paths = getAppPaths()
    const taskDir = paths.tasksDir
    const paramPath = path.join(taskDir, 'param.txt')

    const cleanArgs = args.filter((arg) => !arg.startsWith('--admin-restart'))
    if (cleanArgs.length > 0) {
      writeFileSync(paramPath, cleanArgs.join(' '), 'utf8')
    } else {
      writeFileSync(paramPath, 'empty', 'utf8')
    }

    const schtasks = process.env?.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'schtasks.exe')
      : 'schtasks.exe'

    execSync(`"${schtasks}" /run /tn "${ELEVATE_TASK_NAME}"`, {
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

    execSync(`"${schtasks}" /query /tn "${ELEVATE_TASK_NAME}"`, {
      windowsHide: true,
      stdio: 'pipe'
    })
    return true
  } catch {
    return false
  }
}

export function deleteElevateTask(): void {
  if (process.platform !== 'win32') return
  try {
    const schtasks = process.env?.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'schtasks.exe')
      : 'schtasks.exe'

    execSync(`"${schtasks}" /delete /tn "${ELEVATE_TASK_NAME}" /f`, {
      windowsHide: true,
      stdio: 'pipe'
    })
  } catch {
    // Ignore deletion errors
  }
}
