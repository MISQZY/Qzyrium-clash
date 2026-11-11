import type { MihomoRule } from './mihomo'

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
