import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { validateIpcArguments } from './argument-validation'

interface RendererSource {
  getMainWindow(): BrowserWindow | null
  getRendererUrl(): string
}

function sameDocument(actual: string, expected: string): boolean {
  try {
    const source = new URL(actual)
    const target = new URL(expected)
    // Query parameters and hash routes do not change the trusted document.
    source.search = target.search = ''
    source.hash = target.hash = ''
    return source.href === target.href
  } catch { return false }
}

/** Every invocation rechecks the current window, main frame and document. */
export function createTrustedRegistrar(ipc: Pick<IpcMain, 'handle'>, source: RendererSource) {
  return function handle<Args extends unknown[], Result>(channel: string,
    callback: (event: IpcMainInvokeEvent, ...args: Args) => Result) {
    ipc.handle(channel, (event, ...args: Args) => {
      const win = source.getMainWindow()
      if (!win || win.isDestroyed() || win.webContents.isDestroyed() ||
        event.sender !== win.webContents || !event.senderFrame ||
        event.senderFrame !== win.webContents.mainFrame ||
        !sameDocument(event.senderFrame.url, source.getRendererUrl())) {
        throw new Error('Untrusted IPC sender')
      }
      validateIpcArguments(channel, args)
      return callback(event, ...args)
    })
  }
}

export type TrustedRegistrar = ReturnType<typeof createTrustedRegistrar>
