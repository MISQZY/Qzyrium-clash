export const SHORTCUT_ACTIONS = ['showWindow', 'sysProxy', 'tun', 'ruleMode', 'globalMode', 'directMode'] as const
export type ShortcutAction = typeof SHORTCUT_ACTIONS[number]

/** Compare Electron aliases and modifier order when detecting duplicate bindings. */
export function shortcutIdentity(accelerator: string): string {
  return accelerator.toLowerCase().replace(/\s/g, '').split('+').map((part) => {
    if (['control', 'ctrl', 'commandorcontrol', 'cmdorctrl'].includes(part)) return 'ctrl'
    if (['command', 'cmd', 'meta', 'super'].includes(part)) return 'meta'
    if (part === 'option') return 'alt'
    return part
  }).sort().join('+')
}
