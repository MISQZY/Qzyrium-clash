import type { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'

/** Keep window shortcuts out of the recorder, including native reload/zoom guards. */
export function watchWindowShortcuts(window: BrowserWindow, recording: () => boolean): void {
  window.webContents.on('before-input-event', (event, input) => {
    const capturing = recording()
    window.webContents.setIgnoreMenuShortcuts(capturing)
    if (capturing || input.type !== 'keyDown') return
    const command = input.control || input.meta
    if (is.dev && input.code === 'F12') {
      if (window.webContents.isDevToolsOpened()) window.webContents.closeDevTools()
      else window.webContents.openDevTools({ mode: 'undocked' })
    }
    if (!is.dev && (input.code === 'KeyR' && command || input.code === 'KeyI' && (input.alt && input.meta || input.control && input.shift))) event.preventDefault()
    if (command && (input.code === 'Minus' || input.code === 'Equal' && input.shift)) event.preventDefault()
  })
}
