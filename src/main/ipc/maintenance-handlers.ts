import { app, dialog } from 'electron'
import { writeFileAtomicAsync } from '../utils/atomicWrite'
import { getAppPaths } from '../utils/paths'
import { parseBackup, readBackup, stageBackupRestore, type Backup } from '../utils/backup'
import { IPC_CHANNELS } from '@shared/ipc'
import { nativeMessages } from '@shared/localization'
import type { ServiceManager } from '../services/ServiceManager'
import type { TrustedRegistrar } from './trusted-handler'

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
