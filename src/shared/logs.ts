import type { LogEntry } from './types'

export function normalizeLogLevel(level: string): 'debug' | 'info' | 'warning' | 'error' {
  switch (level.toLowerCase()) {
    case 'trace':
    case 'debug': return 'debug'
    case 'warn':
    case 'warning': return 'warning'
    case 'fatal':
    case 'panic':
    case 'error': return 'error'
    default: return 'info'
  }
}

/** Log only the origin: providers also use paths, fragments and userinfo as credentials. */
export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return '[REDACTED_URL]'
    return url.origin + (url.pathname !== '/' || url.search || url.hash || url.username || url.password
      ? '/[REDACTED]' : '/')
  } catch { return '[REDACTED_URL]' }
}

export function cleanLogMessage(message: string): string {
  // Remove terminal colors and controls, keeping newlines and indentation.
  // eslint-disable-next-line no-control-regex
  return message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/https?:\/\/[^\s"'<>\\]+/gi, value => {
      const suffix = /[),.;]+$/.exec(value)?.[0] ?? ''
      return redactUrl(suffix ? value.slice(0, -suffix.length) : value) + suffix
    })
    .replace(/([?&](?:token|access[_-]?token|refresh[_-]?token|password|secret|client[_-]?secret|key|api[_-]?key|auth)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s,"']+/gi, '$1[REDACTED]')
    .trimEnd()
}

export function parseMihomoLog(line: string, fallback = 'info'): LogEntry | null {
  const text = cleanLogMessage(line).trim()
  if (!text) return null
  let type = fallback
  let payload = text
  let time = new Date().toISOString()
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      if (typeof record.level === 'string') type = record.level
      else if (typeof record.type === 'string') type = record.type
      if (typeof record.msg === 'string') payload = record.msg
      else if (typeof record.payload === 'string') payload = record.payload
      if (typeof record.time === 'string' && !Number.isNaN(Date.parse(record.time))) time = new Date(record.time).toISOString()
    }
  } catch {
    const match = /^(?:time="([^"]+)"\s+)?level=(\w+)\s+msg=("(?:[^"\\]|\\.)*"|.*)$/.exec(text)
    if (match) {
      type = match[2]
      payload = match[3]
      if (match[1] && !Number.isNaN(Date.parse(match[1]))) time = new Date(match[1]).toISOString()
      if (payload.startsWith('"')) {
        try { payload = JSON.parse(payload) as string } catch { /* Preserve non-JSON Go escapes. */ }
      }
    }
  }
  return { type: normalizeLogLevel(type), payload: cleanLogMessage(payload), time, source: 'mihomo' }
}
