import { execFileSync, spawn } from 'child_process'

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

export function restartAsAdmin(): void {
  try {
    // Dynamically resolve Electron app to support both Electron runtime and test runners
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron')
    const electronApp = electron.app || electron.default?.app
    if (!electronApp) return

    if (process.platform !== 'win32') {
      electronApp.relaunch()
      electronApp.exit(0)
      return
    }

    const execPath = process.execPath
    const isPackaged = electronApp.isPackaged
    const args = isPackaged ? process.argv.slice(1) : [electronApp.getAppPath(), ...process.argv.slice(2)]
    const escapedExecPath = execPath.replace(/'/g, "''")
    const escapedArgs = args.map((arg: string) => `'${arg.replace(/'/g, "''")}'`).join(', ')

    const psCommand = args.length > 0
      ? `Start-Process -FilePath '${escapedExecPath}' -ArgumentList @(${escapedArgs}) -Verb RunAs`
      : `Start-Process -FilePath '${escapedExecPath}' -Verb RunAs`

    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref()

    electronApp.exit(0)
  } catch (err) {
    console.error('Failed to relaunch process as Administrator', err)
  }
}
