import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { logger } from './logger'
import { getSystemBinary } from './system-binaries'
import { getAppPaths } from './paths'
import { app } from 'electron'
import { assertTrustedExecutable } from './executable-security'

/**
 * Notifies the operating system and WinINet subsystem that internet proxy
 * settings have changed, causing running browsers (Chrome, Edge, etc.)
 * to immediately pick up new proxy configurations without restart.
 */
export function notifySystemProxyChanged(): void {
  if (process.platform === 'win32' && typeof app?.getPath === 'function') {
    try {
      const runner = getAppPaths().runnerBinaryPath
      if (existsSync(runner)) {
        assertTrustedExecutable(runner)
        execFile(runner, ['--refresh-proxy'], { windowsHide: true }, (err) => {
          if (err) {
            logger.debug(`Failed to notify WinINet of proxy changes: ${String(err)}`)
          } else {
            logger.info('Notified WinINet of system proxy change')
          }
        })
      }
    } catch (err) {
      logger.debug(`Could not invoke proxy refresh runner: ${String(err)}`)
    }
  }
}

/**
 * Flushes the operating system DNS resolver cache.
 * Purges stale Fake-IP (198.18.0.0/16) and proxy DNS mappings so applications
 * immediately resolve direct upstream IPs upon VPN / proxy disconnection.
 */
export function flushSystemDns(): void {
  if (process.platform === 'win32') {
    if (typeof app?.getPath === 'function') {
      try {
        const runner = getAppPaths().runnerBinaryPath
        if (existsSync(runner)) {
          assertTrustedExecutable(runner)
          execFile(runner, ['--flush-dns'], { windowsHide: true }, (err) => {
            if (err) {
              logger.debug(`Failed to flush Windows DNS cache via helper: ${String(err)}`)
              fallbackWinDnsFlush()
            } else {
              logger.info('Flushed Windows DNS cache successfully via resolver API')
            }
          })
          return
        }
      } catch (err) {
        logger.debug(`Could not invoke DNS flush runner: ${String(err)}`)
      }
    }
    fallbackWinDnsFlush()
  } else if (process.platform === 'linux') {
    const resolvectl = ['/usr/bin/resolvectl', '/bin/resolvectl'].find(existsSync) ?? 'resolvectl'
    execFile(resolvectl, ['flush-caches'], (err) => {
      if (!err) {
        logger.info('Flushed systemd-resolved DNS cache')
      }
    })
  }
}

function fallbackWinDnsFlush(): void {
  execFile(getSystemBinary('ipconfig.exe'), ['/flushdns'], { windowsHide: true }, (err) => {
    if (err) {
      logger.debug(`Failed to flush Windows DNS cache: ${String(err)}`)
    } else {
      logger.info('Flushed Windows DNS cache successfully')
    }
  })
}
