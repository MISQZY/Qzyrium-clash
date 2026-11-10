interface ShortcutKey {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  isComposing: boolean
  getModifierState: (key: string) => boolean
}

export function shortcutFromKey(event: ShortcutKey): string | null {
  if (event.isComposing || event.getModifierState('AltGraph')) return null
  const modifiers = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'].filter(Boolean)
  // Physical codes keep shortcuts usable with Russian and other keyboard layouts.
  const namedKeys: Record<string, string> = {
    Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert',
    Delete: 'Delete', Backspace: 'Backspace', Enter: 'Return', Escape: 'Escape',
    Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backquote: '`'
  }
  const functionKey = /^F(?:[1-9]|1\d|2[0-4])$/.test(event.code)
  const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3)
    : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5)
    : functionKey ? event.code : namedKeys[event.code]
  if (!key || (!event.ctrlKey && !event.altKey && !event.metaKey && !functionKey)) return null
  return [...modifiers, key].join('+')
}
