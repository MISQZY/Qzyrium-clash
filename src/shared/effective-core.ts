import type { AppConfig } from './app-config'
import type { LogLevel } from './types'

export const CORE_PORT_KEYS = ['mixed-port', 'port', 'socks-port'] as const
export type CorePortKey = typeof CORE_PORT_KEYS[number]
export type ValueSource = 'profile' | 'override' | 'default'
export interface EffectiveValue<T> { value: T; source: ValueSource }
export interface EffectiveCoreValues {
  ports: Record<CorePortKey, EffectiveValue<number>>
  logLevel: EffectiveValue<LogLevel>
}

/** Shared by synthesis and preview so displayed values follow exactly the same precedence. */
export function resolveEffectiveCore(profile: Record<string, unknown>, settings: AppConfig): EffectiveCoreValues {
  const ports = {} as EffectiveCoreValues['ports']
  for (const key of CORE_PORT_KEYS) {
    const custom = key === 'mixed-port' ? !settings.kernel.inheritMixedPort : settings.kernel.options?.[key] !== undefined
    const fallback = key === 'mixed-port' ? settings.kernel.mixedPort : 0
    const source: ValueSource = custom ? 'override' : profile[key] !== undefined ? 'profile' : 'default'
    const value = source === 'profile' ? profile[key] : custom && key !== 'mixed-port' ? settings.kernel.options?.[key] : fallback
    if (typeof value !== 'number' || !Number.isInteger(value) || value < (key === 'mixed-port' ? 1 : 0) || value > 65535) {
      throw new Error(`Invalid ${key}: expected a port between ${key === 'mixed-port' ? 1 : 0} and 65535`)
    }
    ports[key] = { value, source }
  }
  const custom = !settings.kernel.inheritLogLevel
  const source: ValueSource = custom ? 'override' : profile['log-level'] !== undefined ? 'profile' : 'default'
  const value = source === 'profile' ? profile['log-level'] : settings.kernel.logLevel
  if (!['debug', 'info', 'warning', 'error', 'silent'].includes(value as string)) throw new Error('Invalid profile log level')
  const listeners = [settings.kernel.controllerPort, ...Object.values(ports).map(port => port.value)].filter(port => port > 0)
  if (new Set(listeners).size !== listeners.length) throw new Error('Effective listening ports must be unique')
  return { ports, logLevel: { value: value as LogLevel, source } }
}
