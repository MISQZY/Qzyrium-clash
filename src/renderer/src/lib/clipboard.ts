/**
 * Reliably copy text to clipboard across Electron native process and web fallbacks.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof text !== 'string') return false

  // 1. Primary: Native Electron clipboard via IPC (bypasses Chromium focus/permission constraints)
  if (window.api?.app?.copyToClipboard) {
    try {
      const ok = await window.api.app.copyToClipboard(text)
      if (ok !== false) return true
    } catch {
      // Fall through to browser fallbacks
    }
  }

  // 2. Standard web Async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to legacy fallback
    }
  }

  // 3. Fallback: document.execCommand('copy') with hidden textarea
  if (typeof document !== 'undefined') {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.top = '-9999px'
      el.style.left = '-9999px'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      if (ok) return true
    } catch {
      // Ignore fallback errors
    }
  }

  return false
}
