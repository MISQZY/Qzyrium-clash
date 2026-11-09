import type { AxiosResponse } from 'axios'
import yaml from 'yaml'

function cleanName(value: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- Strip control characters from remote display names.
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return name && !name.includes('\ufffd') ? name : undefined
}

function decodeTitle(value: string): string | undefined {
  if (/^base64:/i.test(value)) {
    const encoded = value.slice(7).trim()
    if (!encoded || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) return
    return cleanName(Buffer.from(encoded, 'base64').toString('utf8'))
  }
  // Node exposes raw UTF-8 HTTP header bytes as Latin-1.
  if ([...value].every((character) => character.charCodeAt(0) <= 255)) {
    const utf8 = Buffer.from(value, 'latin1').toString('utf8')
    if (!utf8.includes('\ufffd')) return cleanName(utf8)
  }
  return cleanName(value)
}

/** Provider metadata is display text only; never use it as a filesystem path. */
export function subscriptionName(headers?: AxiosResponse['headers'], content?: string): string | undefined {
  const header = (name: string): string => {
    const value = headers?.[name]
    return typeof value === 'string' ? value.trim() : ''
  }
  const title = decodeTitle(header('profile-title'))
  if (title) return title
  const disposition = header('content-disposition')
  const extended = /(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(disposition)
  if (extended) {
    const encoded = /^(?:UTF-8|US-ASCII)'[^']*'(.*)$/i.exec(extended[1] ?? extended[2].trim())
    if (encoded) {
      try {
        const name = cleanName(decodeURIComponent(encoded[1]).replace(/\.(?:ya?ml|json|txt)$/i, ''))
        if (name) return name
      } catch { /* A malformed filename must not prevent subscription import. */ }
    }
  }
  const filename = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i.exec(disposition)
  if (filename) {
    const name = decodeTitle((filename[1]?.replace(/\\(.)/g, '$1') ?? filename[2].trim()).replace(/\.(?:ya?ml|json|txt)$/i, ''))
    if (name) return name
  }
  // Read only explicit top-level metadata (or its comment form), never node names.
  // Parse the scalar alone to avoid parsing a potentially large proxy list twice.
  const field = /^(?:#\s*)?(?:profile-title|name|title):[ \t]*(.+)$/m.exec(content ?? '')
  if (field && field[1].length < 8192) {
    try {
      const value: unknown = yaml.parse(field[1])
      if (typeof value === 'string') return decodeTitle(value)
    } catch { /* Invalid optional metadata does not invalidate the subscription. */ }
  }
}
