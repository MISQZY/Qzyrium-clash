const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const emojiPattern = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u

export function emojiParts(text: string): { text: string; emoji: boolean }[] {
  const parts: { text: string; emoji: boolean }[] = []
  for (const { segment } of segmenter.segment(text)) {
    const emoji = emojiPattern.test(segment)
    const previous = parts.at(-1)
    if (!emoji && previous && !previous.emoji) previous.text += segment
    else parts.push({ text: segment, emoji })
  }
  return parts
}

export function emojiAsset(emoji: string): string {
  const normalized = emoji.includes('\u200d') ? emoji : emoji.replace(/\ufe0f/g, '')
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg/${Array.from(normalized, (char) => char.codePointAt(0)!.toString(16)).join('-')}.svg`
}

export function flagCode(emoji: string): string | undefined {
  return /^\p{Regional_Indicator}{2}$/u.test(emoji)
    ? Array.from(emoji, (char) => String.fromCharCode(char.codePointAt(0)! - 0x1f1e6 + 65)).join('')
    : undefined
}

export function countryFlag(code?: string): string {
  return code && /^[a-z]{2}$/i.test(code)
    ? Array.from(code.toUpperCase(), (char) => String.fromCodePoint(char.charCodeAt(0) - 65 + 0x1f1e6)).join('')
    : ''
}
