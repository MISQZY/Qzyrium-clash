import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

/** Grant capabilities before testing/promoting an updated core, preserving rollback on failure. */
export async function grantLinuxCoreCapabilities(binary: string): Promise<void> {
  if (process.platform !== 'linux') return
  const setcap = ['/usr/sbin/setcap', '/sbin/setcap', '/usr/bin/setcap', '/bin/setcap'].find(existsSync)
  if (!setcap) throw new Error('Cannot install Mihomo network capabilities: install libcap2-bin (Debian/Ubuntu) or libcap (RPM).')
  const args = ['cap_net_admin,cap_net_bind_service+ep', binary]
  try {
    if (process.getuid?.() === 0) {
      await runFile(setcap, args, { timeout: 120_000 })
    } else {
      await runFile('/usr/bin/pkexec', [setcap, ...args], { timeout: 120_000 })
    }
  } catch (error) {
    throw new Error('Cannot install Mihomo network capabilities. Authorize the setcap request through polkit and ensure the filesystem supports file capabilities.', { cause: error })
  }
}
