import type { BrowserWindow } from 'electron'

/** Content sizes are in DIP: Windows display scaling is already accounted for. */
export function windowZoomFactor(width: number, height: number): number {
  return Math.round(Math.max(1, Math.min(2, width / 1920, height / 1080)) * 100) / 100
}

export function watchWindowScale(window: BrowserWindow): void {
  const update = () => {
    if (window.isDestroyed()) return
    const [width, height] = window.getContentSize()
    const factor = windowZoomFactor(width, height)
    if (Math.abs(window.webContents.getZoomFactor() - factor) > 0.001) {
      // Chromium zoom keeps media queries, portals, canvas and pointer coordinates
      // in the same coordinate system, including the native titlebar overlay.
      window.webContents.setZoomFactor(factor)
    }
  }
  window.on('resize', update)
  // Navigation/recovery can reset the zoom associated with the renderer origin.
  window.webContents.on('did-finish-load', update)
  update()
}
