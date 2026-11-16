import type { MihomoRule } from './mihomo'
import type { CustomRuleItem } from './profile'

/** Apply prepend/append overrides; append offsets count backwards from the end. */
export function insertRuleOverrides<T extends { offset?: number; position?: 'top' | 'bottom' }>(
  base: T[], overrides: T[], bottomIndex = base.length
): T[] {
  const positioned = overrides.filter((rule) => Number.isSafeInteger(rule.offset) && rule.offset! >= 0)
  const defaults = overrides.filter((rule) => !positioned.includes(rule))
  const top = defaults.filter((rule) => rule.position !== 'bottom')
  const bottom = defaults.filter((rule) => rule.position === 'bottom')
  const result = [...top, ...base.slice(0, bottomIndex), ...bottom, ...base.slice(bottomIndex)]
  const total = result.length + positioned.length
  const inserts = positioned.map((rule) => ({ rule, index: rule.position === 'bottom'
    ? Math.max(0, total - 1 - rule.offset!) : rule.offset! }))
  inserts.sort((a, b) => a.index - b.index)
  for (const { rule, index } of inserts) result.splice(Math.min(index, result.length), 0, rule)
  return result
}

/** Preserve dashboard lookups without retaining every routing condition. */
export function summarizeRules(rules: MihomoRule[]): MihomoRule[] {
  const proxies = new Set<string>()
  const summary: MihomoRule[] = []
  let hasMatch = false
  for (const rule of rules) {
    const firstProxy = !proxies.has(rule.proxy)
    const firstMatch = rule.type === 'MATCH' && !hasMatch
    if (firstProxy || firstMatch) summary.push(rule)
    proxies.add(rule.proxy)
    if (firstMatch) hasMatch = true
  }
  return summary
}

/** Logical rules contain commas inside nested clauses. Split only the outer rule fields. */
export function splitRuleFields(value: string): string[] {
  const fields: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '(') depth++
    else if (value[index] === ')') depth = Math.max(0, depth - 1)
    else if (value[index] === ',' && depth === 0) {
      fields.push(value.slice(start, index))
      start = index + 1
    }
  }
  fields.push(value.slice(start))
  return fields
}

/** Combine base profile rules with custom user overrides. */
export function resolveEffectiveRules(
  rawRules: unknown,
  customRules?: CustomRuleItem[],
  ruleIds?: (string | undefined)[]
): string[] {
  const stringRules = Array.isArray(rawRules)
    ? rawRules.map((rule) => String(rule).trim()).filter(Boolean)
    : []
  if (!customRules?.length) {
    return stringRules
  }
  type Entry = { value: string; id?: string; offset?: number; position?: 'top' | 'bottom'; disabled?: boolean }
  const overrides: Entry[] = []
  const sources = new Map(customRules.filter((rule) => rule.sourceRule !== undefined)
    .map((rule) => [JSON.stringify([rule.sourceRule, rule.sourceOccurrence ?? 0]), rule]))
  const deleted = customRules.filter((rule) => rule.isDeleted && rule.enabled !== false && rule.sourceRule === undefined)
  const occurrences = new Map<string, number>()
  const base: Entry[] = []
  for (const value of stringRules) {
    const occurrence = occurrences.get(value) ?? 0
    occurrences.set(value, occurrence + 1)
    const source = sources.get(JSON.stringify([value, occurrence]))
    if (source) {
      overrides.push({
        value: source.replacementRule ?? value,
        id: source.replacementRule ? source.id : undefined,
        offset: source.offset,
        position: 'top',
        disabled: source.isDeleted || source.enabled === false || !!source.validationError
      })
      continue
    }
    const parts = splitRuleFields(value).map((part) => part.trim())
    const type = parts[0]?.toUpperCase()
    const payload = type === 'MATCH' ? '' : parts[1] || ''
    const proxy = type === 'MATCH' ? parts[1] || '' : parts[2] || ''
    const disabled = deleted.some((rule) => rule.type.toUpperCase() === type &&
      (type === 'MATCH' || rule.payload === payload) && (!rule.proxy || rule.proxy === proxy))
    base.push({ value, disabled })
  }
  for (const rule of customRules) {
    if (rule.sourceRule !== undefined || rule.isDeleted) continue
    const type = (rule.type || '').trim().toUpperCase()
    const payload = (rule.payload || '').trim()
    const proxy = (rule.proxy || 'DIRECT').trim()
    const extra = rule.additionalParams?.length ? `,${rule.additionalParams.join(',')}` : ''
    overrides.push({
      value: type === 'MATCH' ? `MATCH,${proxy}${extra}` : `${type},${payload},${proxy}${extra}`,
      id: rule.id,
      offset: rule.offset,
      position: rule.position,
      disabled: rule.enabled === false || !!rule.validationError
    })
  }
  const matchIndex = base.findLastIndex((rule) => rule.value.toUpperCase().startsWith('MATCH,'))
  const ordered = insertRuleOverrides(base, overrides, matchIndex === -1 ? base.length : matchIndex)
    .filter((rule) => !rule.disabled)
  if (ruleIds) for (const rule of ordered) ruleIds.push(rule.id)
  return ordered.map((rule) => rule.value)
}

/** Parses a Clash / Mihomo rule string into a MihomoRule descriptor. */
export function parseRuleString(ruleStr: string): MihomoRule | null {
  const trimmed = ruleStr.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const parts = splitRuleFields(trimmed).map((p) => p.trim())
  if (!parts[0]) return null
  const type = parts[0].toUpperCase()
  if (type === 'MATCH') {
    return {
      type: 'MATCH',
      payload: '',
      proxy: parts[1] || 'DIRECT'
    }
  }
  return {
    type: parts[0],
    payload: parts[1] || '',
    proxy: parts[2] || 'DIRECT'
  }
}

/** Parses rules from profile configuration and applies custom rules offline. */
export function offlineRules(config: Record<string, unknown>, customRules?: CustomRuleItem[]): MihomoRule[] {
  const rawRules = config && typeof config === 'object' && Array.isArray(config.rules) ? config.rules : []
  const effectiveRuleStrings = resolveEffectiveRules(rawRules, customRules)
  const rules: MihomoRule[] = []
  for (const str of effectiveRuleStrings) {
    const item = parseRuleString(str)
    if (item) rules.push(item)
  }
  return rules
}
