import { app, session } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { logger } from './logger'

function getPowerShellBinary(): string {
  if (process.platform === 'win32' && process.env.SystemRoot) {
    return path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  }
  return 'powershell.exe'
}

/**
 * Aggressively trims memory working set and triggers V8 garbage collection.
 * Reclaims committed RAM from Main, GPU, and Utility processes when the UI
 * is destroyed (e.g. in Core-Only mode or minimized to tray).
 */
export async function trimProcessMemory(): Promise<void> {
  // 1. Clear Chromium network/HTTP/image cache
  try {
    if (session?.defaultSession) {
      await session.defaultSession.clearCache().catch(() => {})
    }
  } catch {
    // Ignore cache clear error
  }

  // 2. Trigger V8 Garbage Collection in Main Process
  try {
    const v8 = await import('node:v8')
    v8.setFlagsFromString('--expose_gc')
    const vm = await import('node:vm')
    vm.runInNewContext('gc()')
  } catch {
    // Ignore GC error
  }

  // 3. On Windows, empty working sets for Main, GPU, Utility and child processes
  if (process.platform === 'win32') {
    try {
      const pids = new Set<number>()
      pids.add(process.pid)
      if (typeof app?.getAppMetrics === 'function') {
        for (const metric of app.getAppMetrics()) {
          if (metric.pid) pids.add(metric.pid)
        }
      }

      const pidList = Array.from(pids).join(',')
      const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Mem {
  [DllImport("psapi.dll")]
  public static extern int EmptyWorkingSet(IntPtr hwProc);
}
"@
@(${pidList}) | ForEach-Object {
  try {
    $proc = [System.Diagnostics.Process]::GetProcessById($_)
    [Win32Mem]::EmptyWorkingSet($proc.Handle) | Out-Null
  } catch {}
}
`
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      execFile(
        getPowerShellBinary(),
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        { windowsHide: true },
        (err) => {
          if (err) {
            logger.warn(`Failed to trim working set via PowerShell: ${err.message}`)
          } else {
            logger.info('Trimmed process working set successfully')
          }
        }
      )
    } catch (err) {
      logger.warn(`Failed to execute memory trim: ${String(err)}`)
    }
  }
}
