import { app } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import type { AppConfig } from '@shared/app-config'

const literal = (value: string): string => `'${value.replace(/'/g, "''")}'`

// Register per user, with an interactive token so the UI appears in their session.
export async function applyWindowsStartup(general: AppConfig['general']): Promise<void> {
  const script = `
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$name = 'Qzyrium-clash-Startup-' + $sid
$task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if (${general.autoStart && general.autoStartAsAdmin ? '$true' : '$false'}) {
  $action = New-ScheduledTaskAction -Execute ${literal(process.execPath)} -WorkingDirectory ${literal(path.dirname(process.execPath))}
  if (!$task -or $task.Actions.Execute -ne $action.Execute -or $task.Principal.RunLevel -ne 'Highest' -or $task.Principal.LogonType -ne 'Interactive' -or $task.State -eq 'Disabled') {
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
    $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  }
} elseif ($task) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false
}
`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const run = (code: string): Promise<void> => new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', code], { windowsHide: true },
      (error) => error ? reject(error) : resolve())
  })
  // An existing matching task is a read-only operation and needs no UAC prompt.
  try { await run(encoded) } catch {
    const elevated = `$ErrorActionPreference = 'Stop'; Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encoded}' | ForEach-Object { if ($_.ExitCode -ne 0) { exit $_.ExitCode } }`
    await run(Buffer.from(elevated, 'utf16le').toString('base64'))
  }
  app.setLoginItemSettings({ openAtLogin: general.autoStart && !general.autoStartAsAdmin })
}
