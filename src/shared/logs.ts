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

export function cleanLogMessage(message: string): string {
  // Remove terminal colors and controls, keeping newlines and indentation.
  // eslint-disable-next-line no-control-regex
  return message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trimEnd()
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
