import { BUILTIN_THEMES, type CustomThemePack } from './theme'
import { isSafeIdentifier } from './identifiers'

export const MAX_THEME_BYTES = 256 * 1024
const reservedThemeNames = new Set(['system', 'dark', 'light'])
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const tokens = new Set(Object.keys(BUILTIN_THEMES[0].colors))
const namedColors = new Set(('transparent aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '))
const colorFunctions = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark', 'var', 'calc', 'min', 'max', 'clamp'])

function validateColor(value: string): void {
  const color = value.trim().toLowerCase()
  if (namedColors.has(color) || /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(color)) return
  if (!/^[a-z-]+\(.+\)$/.test(color) || !/^[\w\s#().,%+*/-]+$/.test(color)) throw new Error('Invalid CSS color')
  let depth = 0
  for (const char of color) {
    if (char === '(') depth++
    if (char === ')' && --depth < 0) throw new Error('Invalid CSS color')
  }
  if (depth !== 0) throw new Error('Invalid CSS color')
  for (const match of color.matchAll(/([a-z-]+)\(/g)) if (!colorFunctions.has(match[1])) throw new Error('Unsupported CSS color function')
}

export function isCustomThemeId(value: unknown): value is string {
  return isSafeIdentifier(value) && !reservedThemeNames.has(value.toLowerCase())
}

/** Structural validation is shared by disk, IPC and renderer; Chromium checks CSS semantics on import. */
export function validateThemeInput(value: unknown, complete = false): asserts value is Partial<CustomThemePack> {
  if (!plain(value) || Object.keys(value).some(key => !['id', 'name', 'mode', 'colors', 'titleBarOverlay'].includes(key))) throw new Error('Invalid theme object')
  if (complete && (!isCustomThemeId(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.mode === undefined || value.colors === undefined)) throw new Error('Invalid theme metadata')
  if (value.id !== undefined && (typeof value.id !== 'string' || value.id.length > 256)) throw new Error('Invalid theme id')
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 128 || value.name.includes('\0'))) throw new Error('Invalid theme name')
  if (value.mode !== undefined && value.mode !== 'light' && value.mode !== 'dark') throw new Error('Invalid theme mode')
  if (value.mode === undefined && value.colors === undefined) throw new Error('Missing theme palette')
  if (value.colors !== undefined) {
    if (!plain(value.colors)) throw new Error('Invalid theme palette')
    for (const [key, color] of Object.entries(value.colors)) {
      if (!tokens.has(key) || typeof color !== 'string' || !color.trim() || color.length > 512 || /[;{}\\]|url\s*\(|!important/i.test(color) || [...color].some(char => char.charCodeAt(0) < 32)) throw new Error('Invalid theme token')
      if (key === '--radius') {
        if (!/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em))$/.test(color.trim())) throw new Error('Invalid theme radius')
      } else {
        validateColor(color)
        if (/\b(?:inherit|initial|unset|revert|currentcolor)\b/i.test(color)) throw new Error('Invalid theme color')
        for (const match of color.matchAll(/var\(\s*(--[\w-]+)/g)) if (!tokens.has(match[1]) || match[1] === '--radius') throw new Error('Unknown theme reference')
      }
    }
    const palette = { ...BUILTIN_THEMES.find(theme => theme.mode === value.mode)?.colors ?? BUILTIN_THEMES[0].colors, ...value.colors }
    const visiting = new Set<string>(), visited = new Set<string>()
    const visit = (key: string): void => {
      if (visiting.has(key)) throw new Error('Circular theme reference')
      if (visited.has(key)) return
      visiting.add(key)
      for (const match of String(palette[key]).matchAll(/var\(\s*(--[\w-]+)/g)) visit(match[1])
      visiting.delete(key)
      visited.add(key)
    }
    for (const key of Object.keys(palette)) visit(key)
  }
  if (value.titleBarOverlay !== undefined) {
    const overlay = value.titleBarOverlay
    if (!plain(overlay) || Object.keys(overlay).some(key => key !== 'color' && key !== 'symbolColor') ||
      ![overlay.color, overlay.symbolColor].every(color => typeof color === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color))) throw new Error('Invalid title bar colors')
  }
  if (JSON.stringify(value).length > MAX_THEME_BYTES) throw new Error('Theme is too large')
}

export function validateThemePack(value: unknown): asserts value is CustomThemePack {
  validateThemeInput(value, true)
}

export function uniqueThemeId(value: string, existing: string[]): string {
  const base = (value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'theme').slice(0, 64)
  const used = new Set(existing.map(id => id.toLowerCase()))
  if (isCustomThemeId(base) && !used.has(base)) return base
  for (let suffix = 2; ; suffix++) {
    const ending = `-${suffix}`
    const id = base.slice(0, 64 - ending.length) + ending
    if (!used.has(id)) return id
  }
}
