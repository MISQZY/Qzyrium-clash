import { app, dialog } from 'electron'
import { writeFileAtomicAsync } from '../utils/atomicWrite'
import { getAppPaths } from '../utils/paths'
import { parseBackup, readBackup, stageBackupRestore, type Backup } from '../utils/backup'
import { IPC_CHANNELS } from '@shared/ipc'
import { nativeMessages } from '@shared/localization'
import { createDiagnostics } from '../utils/diagnostics'
import type { ServiceManager } from '../services/ServiceManager'
import type { TrustedRegistrar } from './trusted-handler'
import { logger } from '../utils/logger'

export function registerMaintenanceHandlers(handle: TrustedRegistrar, services: ServiceManager): void {
  let pending = false
  const exclusive = async (action: () => Promise<boolean>): Promise<boolean> => {
    if (pending) return false
    pending = true
    try { return await action() } finally { pending = false }
  }
  handle(IPC_CHANNELS.APP_EXPORT_BACKUP, () => exclusive(async () => {
    const win = services.windowService.getMainWindow()
    if (!win) return false
    const messages = nativeMessages(services.settingService.getSettings().general)
    const result = await dialog.showSaveDialog(win, { title: messages.exportBackup, defaultPath: `qzyrium-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: messages.backupFile, extensions: ['json'] }] })
    if (result.canceled || !result.filePath) return false
    const settings = services.settingService.getSettings()
    const profiles = await services.profileService.exportProfiles()
    if (JSON.stringify(settings) !== JSON.stringify(services.settingService.getSettings())) throw new Error('Settings changed during export; please retry')
    const backup: Backup = { format: 'qzyrium-backup', version: 1, createdAt: new Date().toISOString(), settings, profiles, themes: services.themeStore.listThemes() }
    const content = JSON.stringify(backup, null, 2)
    parseBackup(content)
    await writeFileAtomicAsync(result.filePath, content)
    return true
  }))
  handle(IPC_CHANNELS.APP_EXPORT_DIAGNOSTICS, () => exclusive(async () => {
    const win = services.windowService.getMainWindow()
    if (!win) return false
    const settings = services.settingService.getSettings()
    const messages = nativeMessages(settings.general)
    const result = await dialog.showSaveDialog(win, { title: messages.exportDiagnostics, defaultPath: `qzyrium-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: 'ZIP', extensions: ['zip'] }] })
    if (result.canceled || !result.filePath) return false
    const coreStatus = services.kernelService.getStatus()
    const coreVersion = coreStatus === 'running' ? (await services.kernelService.getVersion()).version : 'unknown'
    const profiles = await Promise.all(services.profileService.getProfiles().map(async profile => ({
      profile, content: await services.profileService.getProfileContent(profile.id).catch(() => null) ?? ''
    })))
    await logger.flush()
    const content = await createDiagnostics({ appVersion: app.getVersion(), runtimeVersions: {
      electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node
    }, coreVersion, coreStatus, settings, profiles, logsDir: getAppPaths().logsDir })
    await writeFileAtomicAsync(result.filePath, content)
    return true
  }))
  handle(IPC_CHANNELS.APP_IMPORT_BACKUP, () => exclusive(async () => {
    const win = services.windowService.getMainWindow()
    if (!win) return false
    const messages = nativeMessages(services.settingService.getSettings().general)
    const result = await dialog.showOpenDialog(win, { title: messages.importBackup, properties: ['openFile'], filters: [{ name: messages.backupFile, extensions: ['json'] }] })
    if (result.canceled || !result.filePaths[0]) return false
    const backup = await readBackup(result.filePaths[0])
    const confirm = await dialog.showMessageBox(win, { type: 'question', title: messages.importBackup, message: messages.restoreBackupConfirm,
      detail: `${messages.backupProfiles}: ${backup.profiles.length}`, buttons: [messages.cancel, messages.restoreAndRestart], defaultId: 0, cancelId: 0 })
    if (confirm.response !== 1) return false
    await stageBackupRestore(getAppPaths().userData, backup)
    // Quit normally so pending writes and network cleanup finish before restore.
    app.relaunch()
    setImmediate(() => app.quit())
    return true
  }))
}
