import { app } from 'electron'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { execFile } from 'node:child_process'
import { getSystemBinary } from './system-binaries'

const MAX_ICON_CACHE = 80
const iconCache = new Map<string, string>()
const pendingIcons = new Map<string, Promise<string | null>>()

async function resolveProcessName(name: string): Promise<string | null> {
  if (process.platform !== 'win32' || !/^[^<>:"/\\|?*]+\.exe$/i.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32)) return null
  const stem = name.slice(0, -4)
  const local = process.env.LOCALAPPDATA
  const roots = [
    join(process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows', 'System32'),
    ...(local ? [join(local, stem), join(local, 'Programs', stem)] : []),
    ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      .filter((root): root is string => !!root).map((root) => join(root, stem))
  ]
  for (const root of roots) {
    const candidate = join(root, name)
    if (existsSync(candidate)) return candidate
  }
  // Squirrel applications keep their executable in versioned app-* folders.
  if (local) {
    const root = join(local, stem)
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    const versions = entries.filter((entry) => entry.isDirectory() && /^app-\d/i.test(entry.name))
      .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
    for (const version of versions) {
      const candidate = join(root, version.name, name)
      if (existsSync(candidate)) return candidate
    }
  }
  // The name is passed as data, never interpolated into PowerShell code.
  const script = `$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$name = $env:QZYRIUM_ICON_PROCESS_NAME
$found = Get-Process | Where-Object { $_.ProcessName -eq [IO.Path]::GetFileNameWithoutExtension($name) } | Select-Object -ExpandProperty Path -First 1
if (!$found) {
  foreach ($root in @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths')) {
    $found = (Get-Item -LiteralPath ($root + '\\' + $name)).GetValue('')
    if ($found) { break }
  }
}
if ($found) { [Console]::Write($found) }`
  return new Promise((resolve) => {
    execFile(getSystemBinary('WindowsPowerShell\\v1.0\\powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 3000, maxBuffer: 16 * 1024, encoding: 'utf8',
        env: { ...process.env, QZYRIUM_ICON_PROCESS_NAME: name } },
      (error, stdout) => resolve(error ? null : stdout.trim().replace(/^"(.*)"$/, '$1') || null))
  })
}

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
  const pending = pendingIcons.get(processPath)
  if (pending) return pending
  const request = loadProcessIcon(processPath).finally(() => { pendingIcons.delete(processPath) })
  pendingIcons.set(processPath, request)
  return request
}

async function loadProcessIcon(processPath: string): Promise<string | null> {
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
    if (!existsSync(targetPath)) targetPath = await resolveProcessName(basename(trimmed)) || trimmed

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

  // Missing applications may start or be installed later; do not cache misses.
  return null
}
