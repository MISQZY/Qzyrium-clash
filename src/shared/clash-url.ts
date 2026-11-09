export interface ParsedSubscriptionUrl {
  url: string
  name?: string
}

export function parseSubscriptionImportUrl(input: string): ParsedSubscriptionUrl {
  const trimmed = input.trim()
  if (!trimmed) return { url: '' }

  if (/^(clash|qzyrium|mihomo):\/\//i.test(trimmed)) {
    try {
      const qIndex = trimmed.indexOf('?')
      if (qIndex !== -1) {
        const params = new URLSearchParams(trimmed.slice(qIndex + 1))
        const targetUrl = params.get('url')
        const targetName = params.get('name')
        if (targetUrl) {
          return {
            url: targetUrl.trim(),
            name: targetName?.trim() || undefined
          }
        }
      }
    } catch {
      // fallback
    }
  }

  return { url: trimmed }
}

export function buildClashImportUrl(url: string, name?: string): string {
  const params = new URLSearchParams({ url })
  if (name && name.trim()) {
    params.set('name', name.trim())
  }
  return `clash://install-config?${params.toString()}`
}

export function buildQzyriumImportUrl(url: string, name?: string): string {
  const params = new URLSearchParams({ url })
  if (name && name.trim()) {
    params.set('name', name.trim())
  }
  return `qzyrium://install-config?${params.toString()}`
}
