import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { logger } from './logger'

export function applyLinuxStartup(enabled: boolean): void {
  try {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart')
    const desktopFilePath = path.join(autostartDir, 'qzyrium-clash.desktop')

    if (!enabled) {
      if (existsSync(desktopFilePath)) {
        unlinkSync(desktopFilePath)
        logger.info('Removed Linux autostart desktop entry')
      }
      return
    }

    if (!existsSync(autostartDir)) {
      mkdirSync(autostartDir, { recursive: true })
    }

    const execPath = process.env.APPIMAGE || process.execPath
    const content = `[Desktop Entry]
Type=Application
Version=1.0
Name=Qzyrium Clash
Comment=Qzyrium Clash VPN Client
Exec="${execPath}" --silent
Icon=qzyrium-clash
Terminal=false
Categories=Network;
StartupWMClass=Qzyrium-clash
X-GNOME-Autostart-enabled=true
`
    writeFileSync(desktopFilePath, content, 'utf8')
    logger.info(`Configured Linux autostart: ${desktopFilePath}`)
  } catch (err) {
    logger.warn(`Failed to apply Linux startup settings: ${String(err)}`)
  }
}
