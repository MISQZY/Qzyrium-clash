import { execFile } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

/** Check whether Mihomo binary already has required network capabilities on Linux. */
export async function hasLinuxCoreCapabilities(binary: string): Promise<boolean> {
  if (process.platform !== 'linux') return true
  if (process.getuid?.() === 0) return true
  const getcap = ['/usr/sbin/getcap', '/sbin/getcap', '/usr/bin/getcap', '/bin/getcap'].find(existsSync)
  if (!getcap) return false
  try {
    const { stdout } = await runFile(getcap, [binary], { timeout: 5000 })
    return stdout.includes('cap_net_admin') && stdout.includes('cap_net_bind_service')
  } catch {
    return false
  }
}

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

/** Ensure Mihomo binary has required capabilities before launching TUN on Linux without root. */
export async function ensureLinuxCoreCapabilities(binary: string): Promise<string> {
  if (process.platform !== 'linux') return binary
  if (process.getuid?.() === 0) return binary
  if (await hasLinuxCoreCapabilities(binary)) return binary

  let targetBinary = binary
  if (process.env.APPIMAGE || process.env.APPDIR || binary.includes('.mount_')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getAppPaths } = require('./paths')
      const targetDir = path.join(getAppPaths().coresDir, 'bundled')
      mkdirSync(targetDir, { recursive: true })
      targetBinary = path.join(targetDir, path.basename(binary))
      if (!existsSync(targetBinary) || (existsSync(binary) && (statSync(binary).size !== statSync(targetBinary).size || statSync(binary).mtimeMs > statSync(targetBinary).mtimeMs))) {
        copyFileSync(binary, targetBinary)
        chmodSync(targetBinary, 0o755)
      }
    } catch {
      targetBinary = binary
    }
    if (await hasLinuxCoreCapabilities(targetBinary)) return targetBinary
  }

  await grantLinuxCoreCapabilities(targetBinary)
  return targetBinary
}
