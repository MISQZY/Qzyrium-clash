import type { BrowserWindow, Rectangle } from 'electron'
import { screen } from 'electron'

const RESIZE_INTERVAL_MS = 50

/** Content sizes are in DIP: Windows display scaling is already accounted for. */
export function windowZoomFactor(width: number, height: number): number {
  return Math.round(Math.max(1, Math.min(2, width / 1920, height / 1080)) * 100) / 100
}

export function watchWindowScale(window: BrowserWindow): void {
  let notifiedFactor: number | undefined
  let resizing = false
  let lastResizeAt = 0
  let pendingBounds: Rectangle | undefined
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  let anchor: { bounds: Rectangle; cursor: { x: number; y: number } } | undefined
  const requestedBounds = (edge: string, fallback: Rectangle): Rectangle => {
    if (!anchor) return { ...fallback }
    const cursor = screen.getCursorScreenPoint()
    const { bounds, cursor: start } = anchor
    const [minWidth, minHeight] = window.getMinimumSize()
    const [maxWidth, maxHeight] = window.getMaximumSize()
    let width = bounds.width + (edge.includes('right') ? cursor.x - start.x : edge.includes('left') ? start.x - cursor.x : 0)
    let height = bounds.height + (edge.includes('bottom') ? cursor.y - start.y : edge.includes('top') ? start.y - cursor.y : 0)
    width = Math.max(minWidth, Math.min(maxWidth || Infinity, width))
    height = Math.max(minHeight, Math.min(maxHeight || Infinity, height))
    return { x: edge.includes('left') ? bounds.x + bounds.width - width : bounds.x,
      y: edge.includes('top') ? bounds.y + bounds.height - height : bounds.y, width, height }
  }
  const update = (force = false) => {
    if (window.isDestroyed() || resizing) return
    const [width, height] = window.getContentSize()
    const factor = windowZoomFactor(width, height)
    if (Math.abs(window.webContents.getZoomFactor() - factor) > 0.001) {
      // Chromium zoom keeps media queries, portals, canvas and pointer coordinates
      // in the same coordinate system, including the native titlebar overlay.
      window.webContents.setZoomFactor(factor)
    }
    // A resize at the same zoom must not trigger renderer-wide style mutations.
    // Re-send after navigation because a new preload has not seen the old value.
    if (force || factor !== notifiedFactor) {
      window.webContents.send('window:zoom-changed', factor)
      notifiedFactor = factor
    }
  }
  const finishResize = (commit = true) => {
    if (!resizing) return
    clearTimeout(resizeTimer)
    resizeTimer = undefined
    const bounds = pendingBounds
    pendingBounds = undefined
    if (commit && bounds && !window.isDestroyed() && !window.isMaximized()) {
      const current = window.getBounds()
      if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
        window.setBounds(bounds)
      }
    }
    resizing = false
    if (window.isDestroyed()) return
    update(true)
  }
  if (process.platform === 'win32') {
    // WM_SIZING bounds include Windows' invisible DWM border, unlike setBounds.
    // Use the visible starting bounds plus cursor delta when committing a frame;
    // passing raw will-resize bounds to setBounds makes the window drift/grow.
    window.hookWindowMessage(0x0231, () => { // WM_ENTERSIZEMOVE
      anchor = { bounds: window.getBounds(), cursor: screen.getCursorScreenPoint() }
    })
    window.hookWindowMessage(0x0232, () => { // WM_EXITSIZEMOVE
      finishResize()
      anchor = undefined
    })
  }
  window.on('will-resize', (event, bounds, details) => {
    if (process.platform !== 'win32' || window.isDestroyed()) return
    if (!resizing) {
      resizing = true
      lastResizeAt = 0
    }
    if (!bounds) return
    pendingBounds = requestedBounds(details?.edge ?? '', bounds)
    // Bound native surface allocation, not just renderer work. The final border
    // position is committed on release even when its last intermediate event skips.
    const now = Date.now()
    if (now - lastResizeAt < RESIZE_INTERVAL_MS) {
      event.preventDefault()
      if (resizeTimer === undefined) {
        resizeTimer = setTimeout(() => {
          resizeTimer = undefined
          if (!resizing || !pendingBounds || window.isDestroyed()) return
          lastResizeAt = Date.now()
          window.setBounds(pendingBounds)
        }, RESIZE_INTERVAL_MS - (now - lastResizeAt))
      }
      return
    }
    clearTimeout(resizeTimer)
    resizeTimer = undefined
    lastResizeAt = now
  })
  window.on('resized', () => finishResize())
  window.on('hide', () => finishResize(false))
  window.on('minimize', () => finishResize(false))
  window.on('resize', () => update())
  // Navigation/recovery can reset the zoom associated with the renderer origin.
  window.webContents.on('did-finish-load', () => update(true))
  update()
}
