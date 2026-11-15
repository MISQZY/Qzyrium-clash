import { nativeMessage } from '@shared/localization'
import { dialog } from 'electron'
import { open, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import type { CustomThemePack } from '@shared/theme'
import type { ServiceManager } from '../services/ServiceManager'
import type { TrustedRegistrar } from './trusted-handler'

export function registerThemeHandlers(
  handle: TrustedRegistrar,
  services: Pick<ServiceManager, 'themeStore' | 'windowService' | 'settingService'>
): void {
  handle(IPC_CHANNELS.THEME_GET_CUSTOM_THEMES, () => {
    const themes = services.themeStore.listThemes()
    return { themes, skippedFiles: services.themeStore.getSkippedFiles() }
  })

  handle(IPC_CHANNELS.THEME_SAVE_CUSTOM_THEME, (_event, pack: CustomThemePack): CustomThemePack[] => {
    return services.themeStore.saveTheme(pack)
  })

  handle(IPC_CHANNELS.THEME_DELETE_CUSTOM_THEME, (_event, id: string): CustomThemePack[] => {
    return services.themeStore.deleteTheme(id)
  })

  handle(IPC_CHANNELS.WINDOW_SET_TITLEBAR_OVERLAY, (_event, overlay: { color?: string; symbolColor?: string }): void => {
    services.windowService.setTitleBarOverlay(overlay)
  })

  handle(IPC_CHANNELS.CONFIG_OPEN_JSON_FILE, async (): Promise<{ fileName: string; content: string } | null> => {
    const win = services.windowService.getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: nativeMessage(services.settingService.getSettings().general.language, 'jsonConfig', services.settingService.getSettings().general), extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const file = await open(filePath, 'r')
    let content: string
    try {
      // Also used for localization imports; bound the read before allocating the file.
      const limit = 2 * 1024 * 1024
      const buffer = Buffer.alloc(limit + 1)
      if (!(await file.stat()).isFile()) throw new Error('Expected a regular JSON file')
      let size = 0
      while (size <= limit) {
        const { bytesRead } = await file.read(buffer, size, buffer.length - size, null)
        if (!bytesRead) break
        size += bytesRead
      }
      if (size > limit) throw new Error('JSON file exceeds 2 MB')
      content = buffer.subarray(0, size).toString('utf-8')
    } finally { await file.close() }
    return { fileName: basename(filePath), content }
  })

  handle(IPC_CHANNELS.CONFIG_SAVE_TEXT_FILE, async (_event, defaultFileName: string, content: string): Promise<boolean> => {
    const win = services.windowService.getMainWindow()
    if (!win) return false
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultFileName,
      filters: [{ name: nativeMessage(services.settingService.getSettings().general.language, 'jsonConfig', services.settingService.getSettings().general), extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, content, 'utf-8')
    return true
  })
}
