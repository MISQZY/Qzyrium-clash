import { memo, useMemo, useState } from 'react'
import { emojiAsset, emojiParts, flagCode } from '../lib/emoji'

const EmojiGlyph = memo(function EmojiGlyph({ emoji }: { emoji: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  return <span className={`name-emoji name-emoji-${state}`} role="img" aria-label={emoji} data-fallback={flagCode(emoji)}>
    <span className="name-emoji-native" aria-hidden="true">{emoji}</span>
    {state !== 'failed' && <img src={emojiAsset(emoji)} alt="" aria-hidden="true" loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setState('ready')} onError={() => setState('failed')} />}
  </span>
})

/** Keep original Unicode in labels, selection keys and copied text. */
export const EmojiText = memo(function EmojiText({ text }: { text: string }) {
  const parts = useMemo(() => emojiParts(text), [text])
  return <>{parts.map((part, index) => part.emoji ? <EmojiGlyph key={`${index}:${part.text}`} emoji={part.text} /> : part.text)}</>
})
