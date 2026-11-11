import { execFile } from 'node:child_process'
import { logger } from './logger'

/**
 * Flushes the operating system DNS resolver cache.
 * Purges stale Fake-IP (198.18.0.0/16) and proxy DNS mappings so applications
 * immediately resolve direct upstream IPs upon VPN / proxy disconnection.
 */
export function flushSystemDns(): void {
  if (process.platform === 'win32') {
    execFile('ipconfig', ['/flushdns'], { windowsHide: true }, (err) => {
      if (err) {
        logger.warn(`Failed to flush Windows DNS cache: ${String(err)}`)
      } else {
        logger.info('Flushed Windows DNS cache successfully')
      }
    })
  }
}
