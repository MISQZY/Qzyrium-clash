import { IPC_CHANNELS } from '@shared/ipc'
import { DEFAULT_APP_CONFIG } from '@shared/app-config'
import { validateLocalizationPack } from '@shared/custom-localization'

type Check = (value: unknown) => boolean
type InvokeChannel = Exclude<typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS], `event:${string}`>
const optional = (check: Check): Check => value => value === undefined || check(value)
const text: Check = value => typeof value === 'string'
const name: Check = value => text(value) && (value as string).length > 0 && !(value as string).includes('\0')
const boolean: Check = value => typeof value === 'boolean'
const integer = (min: number, max = Number.MAX_SAFE_INTEGER): Check => value =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
const oneOf = (...values: unknown[]): Check => value => values.includes(value)
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check)
const plain: Check = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const safeKey = (key: string) => !['__proto__', 'constructor', 'prototype'].includes(key)
const record = (check: Check): Check => value => plain(value) &&
  Object.entries(value as object).every(([key, item]) => safeKey(key) && check(item))
const object = (fields: Record<string, Check>): Check => value => plain(value) &&
  Object.keys(value as object).every(key => safeKey(key) && Object.hasOwn(fields, key)) &&
  Object.entries(fields).every(([key, check]) => check((value as Record<string, unknown>)[key]))
const optionalFields = (fields: Record<string, Check>) => Object.fromEntries(
  Object.entries(fields).map(([key, check]) => [key, optional(check)]))

// Bound traversal and reject cycles before passing arbitrary config values onward.
function json(value: unknown, depth = 0, ancestors = new Set<unknown>()): boolean {
  if (value === null || value === undefined || text(value) || boolean(value)) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (depth > 32 || ancestors.has(value) || (!Array.isArray(value) && !plain(value))) return false
  ancestors.add(value)
  const valid = Object.entries(value as object).every(([key, child]) =>
    safeKey(key) && json(child, depth + 1, ancestors))
  ancestors.delete(value)
  return valid
}
const config: Check = value => plain(value) && json(value)
const localization: Check = value => {
  try { validateLocalizationPack(value); return true } catch { return false }
}
const primitiveDefaults = (defaults: object): Record<string, Check> => Object.fromEntries(
  Object.entries(defaults).filter(([, value]) => ['boolean', 'string', 'number'].includes(typeof value))
    .map(([key, value]) => [key, typeof value === 'boolean' ? boolean : typeof value === 'string' ? text
      : (input: unknown) => typeof input === 'number' && Number.isFinite(input)]))
const general = object(optionalFields({ ...primitiveDefaults(DEFAULT_APP_CONFIG.general),
  language: oneOf('ru', 'en'), shortcuts: record(text), customLocalizations: list(localization),
  customLocalization: value => value === null || text(value) }))
const tun = object(optionalFields({ ...primitiveDefaults(DEFAULT_APP_CONFIG.kernel.tun),
  stack: oneOf('system', 'gvisor', 'mixed'), dnsHijack: list(text), options: config }))
const nullableConfig: Check = value => value === null || config(value)
const settings = object(optionalFields({ general,
  kernel: object(optionalFields({ ...primitiveDefaults(DEFAULT_APP_CONFIG.kernel), tun,
    mode: oneOf('rule', 'global', 'direct'), logLevel: oneOf('info', 'warning', 'debug', 'error', 'silent'),
    options: config, dns: nullableConfig, sniffer: nullableConfig, resources: nullableConfig })),
  sysProxy: object(optionalFields({ enable: boolean, bypass: list(text), mode: oneOf('manual', 'pac'),
    host: text, pacScript: text })), activeProfileId: value => value === null || name(value) }))
const rule = object({ id: name, type: name, payload: text, proxy: text,
  ...optionalFields({ position: oneOf('top', 'bottom'), enabled: boolean, validationError: text,
    additionalParams: list(text), isDeleted: boolean, offset: integer(0), sourceRule: text,
    sourceOccurrence: integer(0), replacementRule: text }) })
const profilePatch = object(optionalFields({ name: text, url: text, autoUpdate: boolean,
  updateViaProxy: boolean, interval: integer(15, 43200), customUA: text }))
const overlay = object(optionalFields({ color: text, symbolColor: text }))
const theme = object({ id: name, name: text, mode: oneOf('light', 'dark'), colors: record(text),
  titleBarOverlay: optional(object({ color: text, symbolColor: text })) })
const id: Check = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const httpUrl: Check = value => {
  if (!name(value)) return false
  try { return ['http:', 'https:'].includes(new URL(value as string).protocol) } catch { return false }
}

// Explicit coverage makes a new channel require an input contract at compile time.
const contracts = {
  [IPC_CHANNELS.KERNEL_GET_STATUS]: [], [IPC_CHANNELS.KERNEL_GET_SESSION_STARTED_AT]: [],
  [IPC_CHANNELS.KERNEL_GET_RULE_WARNING]: [], [IPC_CHANNELS.KERNEL_START]: [],
  [IPC_CHANNELS.KERNEL_STOP]: [], [IPC_CHANNELS.KERNEL_RESTART]: [], [IPC_CHANNELS.KERNEL_GET_VERSION]: [],
  [IPC_CHANNELS.MIHOMO_GET_CONFIGS]: [], [IPC_CHANNELS.MIHOMO_PATCH_CONFIGS]: [config],
  [IPC_CHANNELS.MIHOMO_GET_PROXIES]: [], [IPC_CHANNELS.MIHOMO_SELECT_PROXY]: [name, name],
  [IPC_CHANNELS.MIHOMO_TEST_DELAY]: [name, optional(httpUrl), optional(integer(1, 120_000))],
  [IPC_CHANNELS.MIHOMO_GET_RULES]: [optional(oneOf('summary'))],
  [IPC_CHANNELS.MIHOMO_GET_CONNECTIONS]: [], [IPC_CHANNELS.MIHOMO_GET_GLOBE_LOCATIONS]: [],
  [IPC_CHANNELS.MIHOMO_CLOSE_CONNECTION]: [name], [IPC_CHANNELS.MIHOMO_CLOSE_ALL_CONNECTIONS]: [],
  [IPC_CHANNELS.PROFILE_GET_LIST]: [], [IPC_CHANNELS.PROFILE_GET_ACTIVE]: [],
  [IPC_CHANNELS.PROFILE_SET_ACTIVE]: [id], [IPC_CHANNELS.PROFILE_DELETE]: [id],
  [IPC_CHANNELS.PROFILE_UPDATE]: [id], [IPC_CHANNELS.PROFILE_GET_CUSTOM_RULES]: [id],
  [IPC_CHANNELS.PROFILE_SAVE_CUSTOM_RULES]: [id, list(rule)],
  [IPC_CHANNELS.PROFILE_VALIDATE_CUSTOM_RULES]: [id, list(rule)],
  [IPC_CHANNELS.PROFILE_GET_RAW_CONFIG]: [id], [IPC_CHANNELS.PROFILE_SAVE_RAW_CONFIG]: [id, text],
  [IPC_CHANNELS.PROFILE_UPDATE_INFO]: [id, profilePatch],
  [IPC_CHANNELS.PROFILE_ADD]: [object({ type: oneOf('local', 'remote'),
    ...optionalFields({ name: text, url: text, content: text, updateViaProxy: boolean }) })],
  [IPC_CHANNELS.SYSPROXY_GET_STATUS]: [], [IPC_CHANNELS.SYSPROXY_SET]: [boolean],
  [IPC_CHANNELS.APP_GET_SETTINGS]: [], [IPC_CHANNELS.APP_UPDATE_SETTINGS]: [settings],
  [IPC_CHANNELS.APP_SET_SHORTCUT_RECORDING]: [boolean], [IPC_CHANNELS.APP_MINIMIZE]: [],
  [IPC_CHANNELS.APP_MAXIMIZE]: [], [IPC_CHANNELS.APP_CLOSE]: [],
  [IPC_CHANNELS.APP_OPEN_FOLDER]: [oneOf('logs', 'data', 'profiles')],
  [IPC_CHANNELS.THEME_GET_CUSTOM_THEMES]: [], [IPC_CHANNELS.THEME_SAVE_CUSTOM_THEME]: [theme],
  [IPC_CHANNELS.THEME_DELETE_CUSTOM_THEME]: [id], [IPC_CHANNELS.CONFIG_OPEN_JSON_FILE]: [],
  [IPC_CHANNELS.CONFIG_SAVE_TEXT_FILE]: [name, text], [IPC_CHANNELS.WINDOW_SET_TITLEBAR_OVERLAY]: [overlay],
  [IPC_CHANNELS.APP_IS_ELEVATED]: [], [IPC_CHANNELS.APP_RESTART_AS_ADMIN]: [],
  [IPC_CHANNELS.APP_ENTER_CORE_ONLY]: [], [IPC_CHANNELS.APP_GET_PROCESS_ICON]: [text],
  [IPC_CHANNELS.APP_GET_APP_VERSION]: [], [IPC_CHANNELS.APP_CHECK_UPDATES]: [],
  [IPC_CHANNELS.APP_GET_UPDATER_STATUS]: [], [IPC_CHANNELS.APP_DOWNLOAD_UPDATE]: [],
  [IPC_CHANNELS.APP_GET_WHATS_NEW]: [], [IPC_CHANNELS.APP_OPEN_URL]: [text],
  [IPC_CHANNELS.APP_COPY_TO_CLIPBOARD]: [text], [IPC_CHANNELS.APP_GET_BOOT_SNAPSHOT]: []
} satisfies Record<InvokeChannel, Check[]>

export function validateIpcArguments(channel: string, args: unknown[]): void {
  const checks = (contracts as Record<string, Check[]>)[channel]
  if (!checks || args.length > checks.length || !checks.every((check, index) => check(args[index]))) {
    // Never include argument values: they may contain credentials or config text.
    throw new Error(`Invalid IPC arguments: ${channel}`)
  }
}
