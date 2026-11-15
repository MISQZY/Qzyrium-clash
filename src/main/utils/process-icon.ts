import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const MAX_ICON_CACHE = 80
const iconCache = new Map<string, string>()

function setCachedIcon(key: string, value: string): void {
  if (iconCache.size >= MAX_ICON_CACHE) {
    const oldest = iconCache.keys().next().value
    if (oldest) iconCache.delete(oldest)
  }
  iconCache.set(key, value)
}

export function clearProcessIconCache(): void {
  iconCache.clear()
}

export async function getProcessIconDataUrl(processPath: string): Promise<string | null> {
  if (!processPath || typeof processPath !== 'string') return null
  if (iconCache.has(processPath)) return iconCache.get(processPath) || null

  try {
    const trimmed = processPath.trim()
    if (process.platform === 'win32') {
      // Disallow UNC paths, network shares, namespaces, and control characters to prevent NTLM leak / SMB probe
      if (/^([\\/]{2}|\\\\?\?\\)/i.test(trimmed) || trimmed.includes('\0')) {
        setCachedIcon(processPath, '')
        return null
      }
    }

    const lower = trimmed.toLowerCase()
    if (lower.includes('qzyrium') || lower === 'qzyrium-clash.exe' || lower === 'qzyrium-clash') {
      const appIcon = await app.getFileIcon(process.execPath, { size: 'normal' }).catch(() => null)
      if (appIcon && !appIcon.isEmpty()) {
        const dataUrl = appIcon.toDataURL()
        setCachedIcon(processPath, dataUrl)
        return dataUrl
      }
    }

    let targetPath = trimmed
    if (!existsSync(targetPath)) {
      if (process.platform === 'win32') {
        if (/^[a-zA-Z0-9_.-]+\.exe$/i.test(trimmed)) {
          const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows'
          const candidate = join(windir, 'System32', trimmed)
          if (existsSync(candidate)) {
            targetPath = candidate
          }
        }
      }
    }

    const isLocalAbsolute = process.platform === 'win32'
      ? /^[a-zA-Z]:[\\/]/.test(targetPath)
      : targetPath.startsWith('/')

    if (isLocalAbsolute && existsSync(targetPath)) {
      const icon = await app.getFileIcon(targetPath, { size: 'normal' })
      if (icon && !icon.isEmpty()) {
        const dataUrl = icon.toDataURL()
        setCachedIcon(processPath, dataUrl)
        return dataUrl
      }
    }
  } catch {
    // Ignore file icon extraction failures
  }

  setCachedIcon(processPath, '')
  return null
}
