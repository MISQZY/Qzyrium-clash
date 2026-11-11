import type { CustomRuleItem } from './profile'
import { insertRuleOverrides } from './rules'

export interface RuleItem {
  id: string
  type: string
  payload: string
  proxy: string
  additionalParams?: string[]
  position?: 'top' | 'bottom'
  isCustom?: boolean
  isDeleted?: boolean
  offset?: number
  sourceRule?: string
  sourceOccurrence?: number
  sourceIndex?: number
  isMoved?: boolean
  enabled?: boolean
  validationError?: string
  replacementRule?: string
}

export function toCustomRules(ruleItems: RuleItem[]): CustomRuleItem[] {
  return ruleItems.flatMap((rule, index): CustomRuleItem[] => {
    const replacementRule = rule.sourceRule !== undefined && convertRuleToString(rule) !== rule.sourceRule
      ? convertRuleToString(rule) : undefined
    if (rule.sourceRule !== undefined && !rule.isMoved && !rule.isDeleted && !replacementRule && rule.enabled !== false) return []
    if (rule.sourceRule === undefined && !rule.isCustom && !rule.isDeleted) return []
    const position = rule.sourceRule !== undefined ? 'top' : rule.position || 'top'
    return [{
      id: rule.id, type: rule.type, payload: rule.payload, proxy: rule.proxy,
      additionalParams: rule.additionalParams, position,
      offset: position === 'bottom' ? ruleItems.length - 1 - index : index,
      sourceRule: rule.sourceRule, sourceOccurrence: rule.sourceOccurrence,
      replacementRule,
      isDeleted: rule.isDeleted, enabled: rule.enabled !== false,
      validationError: rule.validationError
    }]
  })
}

export function mergeRuleOverrides(baseRules: RuleItem[], overrides: CustomRuleItem[]): RuleItem[] {
  const sources = new Map(overrides.filter((rule) => rule.sourceRule !== undefined)
    .map((rule) => [JSON.stringify([rule.sourceRule, rule.sourceOccurrence ?? 0]), rule]))
  const deleted = overrides.filter((rule) => rule.sourceRule === undefined && rule.isDeleted && rule.enabled !== false)
  const base: RuleItem[] = []
  const inserts: RuleItem[] = overrides.filter((rule) => rule.sourceRule === undefined && !rule.isDeleted)
    .map((rule) => ({ ...rule, isCustom: true }))
  for (const rule of baseRules) {
    const source = sources.get(JSON.stringify([rule.sourceRule, rule.sourceOccurrence ?? 0]))
    if (source) {
      inserts.push({ ...rule, ...source, position: 'top', isCustom: false, isMoved: true })
    } else {
      base.push({ ...rule, offset: undefined, isMoved: false, isDeleted: deleted.some((item) =>
        item.type === rule.type && item.payload === rule.payload && (!item.proxy || item.proxy === rule.proxy)) })
    }
  }
  const match = base.findLastIndex((rule) => rule.type === 'MATCH')
  return insertRuleOverrides(base, inserts, match === -1 ? base.length : match)
}

export type RuleDraft = Omit<RuleItem, 'id'>

export const createRuleId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `rule-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

export const logicalRuleTypes = new Set(['AND', 'OR', 'NOT'])
export const isLogicalRuleType = (ruleType: string): boolean => logicalRuleTypes.has(ruleType.toUpperCase())

export const splitByTopLevelCommas = (value: string): string[] => {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (const char of value) {
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    current += char
  }

  parts.push(current)
  return parts
}

export const isFullyWrappedByParentheses = (value: string): boolean => {
  if (!value.startsWith('(') || !value.endsWith(')')) return false
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth += 1
    if (value[i] === ')') depth -= 1
    if (depth < 0) return false
    if (depth === 0 && i < value.length - 1) return false
  }
  return depth === 0
}

export const unwrapFullyWrappedParentheses = (value: string): string => {
  let result = value.trim()
  while (isFullyWrappedByParentheses(result)) {
    result = result.slice(1, -1).trim()
  }
  return result
}

export const getLogicalRuleClauses = (payload: string): string[] => {
  const normalized = unwrapFullyWrappedParentheses(payload)
  if (!normalized) return []
  return splitByTopLevelCommas(normalized)
    .map((clause) => unwrapFullyWrappedParentheses(clause).trim())
    .filter(Boolean)
}

export const formatLogicalRuleClause = (clause: string): string => {
  const parts = splitByTopLevelCommas(clause).map((p) => p.trim())
  if (parts.length <= 1) return clause
  const [cType, ...cValues] = parts
  return cValues.length > 0 ? `${cType}: ${cValues.join(', ')}` : cType
}

export const ruleDefinitionsMap = new Map<
  string,
  {
    name: string
    example?: string
    noResolve?: boolean
    src?: boolean
  }
>([
  ['DOMAIN', { name: 'DOMAIN', example: 'example.com' }],
  ['DOMAIN-SUFFIX', { name: 'DOMAIN-SUFFIX', example: 'example.com' }],
  ['DOMAIN-KEYWORD', { name: 'DOMAIN-KEYWORD', example: 'example' }],
  ['DOMAIN-REGEX', { name: 'DOMAIN-REGEX', example: 'example.*' }],
  ['GEOSITE', { name: 'GEOSITE', example: 'youtube' }],
  ['GEOIP', { name: 'GEOIP', example: 'RU', noResolve: true, src: true }],
  ['SRC-GEOIP', { name: 'SRC-GEOIP', example: 'RU' }],
  ['IP-ASN', { name: 'IP-ASN', example: '13335', noResolve: true, src: true }],
  ['SRC-IP-ASN', { name: 'SRC-IP-ASN', example: '9808' }],
  [
    'IP-CIDR',
    {
      name: 'IP-CIDR',
      example: '192.168.1.0/24',
      noResolve: true,
      src: true
    }
  ],
  [
    'IP-CIDR6',
    {
      name: 'IP-CIDR6',
      example: '2620:0:2d0:200::7/32',
      noResolve: true,
      src: true
    }
  ],
  [
    'SRC-IP-CIDR',
    {
      name: 'SRC-IP-CIDR',
      example: '192.168.1.201/32'
    }
  ],
  [
    'IP-SUFFIX',
    {
      name: 'IP-SUFFIX',
      example: '8.8.8.8/24',
      noResolve: true,
      src: true
    }
  ],
  [
    'SRC-IP-SUFFIX',
    {
      name: 'SRC-IP-SUFFIX',
      example: '192.168.1.201/8'
    }
  ],
  ['SRC-PORT', { name: 'SRC-PORT', example: '7777' }],
  ['DST-PORT', { name: 'DST-PORT', example: '80' }],
  ['IN-PORT', { name: 'IN-PORT', example: '7897' }],
  ['DSCP', { name: 'DSCP', example: '4' }],
  ['PROCESS-NAME', { name: 'PROCESS-NAME', example: 'chrome.exe' }],
  ['PROCESS-PATH', { name: 'PROCESS-PATH', example: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }],
  ['PROCESS-NAME-REGEX', { name: 'PROCESS-NAME-REGEX', example: '.*telegram.*' }],
  ['PROCESS-PATH-REGEX', { name: 'PROCESS-PATH-REGEX', example: '(?i).*Application\\\\chrome.*' }],
  ['NETWORK', { name: 'NETWORK', example: 'udp' }],
  ['UID', { name: 'UID', example: '1001' }],
  ['IN-TYPE', { name: 'IN-TYPE', example: 'SOCKS/HTTP' }],
  ['IN-USER', { name: 'IN-USER', example: 'mihomo' }],
  ['IN-NAME', { name: 'IN-NAME', example: 'ss' }],
  ['SUB-RULE', { name: 'SUB-RULE', example: '(NETWORK,tcp)' }],
  ['RULE-SET', { name: 'RULE-SET', example: 'providername', noResolve: true, src: true }],
  ['AND', { name: 'AND', example: '((DOMAIN,example.com),(NETWORK,UDP))' }],
  ['OR', { name: 'OR', example: '((NETWORK,UDP),(DOMAIN,example.com))' }],
  ['NOT', { name: 'NOT', example: '((DOMAIN,example.com))' }],
  ['MATCH', { name: 'MATCH', example: 'MATCH' }]
])

export const ruleTypes = Array.from(ruleDefinitionsMap.keys())

export const isRuleSupportsNoResolve = (ruleType: string): boolean => {
  return ruleDefinitionsMap.get(ruleType.toUpperCase())?.noResolve === true
}

export const isRuleSupportsSrc = (ruleType: string): boolean => {
  return ruleDefinitionsMap.get(ruleType.toUpperCase())?.src === true
}

export const getRuleExample = (ruleType: string): string => {
  return ruleDefinitionsMap.get(ruleType.toUpperCase())?.example || ''
}

export const parseRuleStringToItem = (ruleStr: string, isCustom = false): RuleItem => {
  const parts = splitByTopLevelCommas(ruleStr).map((p) => p.trim())
  const firstPartIsNumber = parts.length >= 3 && parts[0] !== '' && !Number.isNaN(Number(parts[0]))
  const offset = firstPartIsNumber ? Number.parseInt(parts[0], 10) : undefined
  const ruleParts = firstPartIsNumber ? parts.slice(1) : parts
  const [type = '', payload = '', proxy = '', ...additionalParamsRaw] = ruleParts

  const normalizedType = type.toUpperCase()
  if (normalizedType === 'MATCH') {
    return {
      id: createRuleId(),
      type: 'MATCH',
      payload: '',
      proxy: payload || proxy || 'DIRECT',
      isCustom,
      offset: Number.isSafeInteger(offset) && offset! >= 0 ? offset : undefined
    }
  }

  return {
    id: createRuleId(),
    type: normalizedType || type,
    payload,
    proxy: proxy || 'DIRECT',
    additionalParams: additionalParamsRaw.filter(Boolean),
    isCustom,
    offset: Number.isSafeInteger(offset) && offset! >= 0 ? offset : undefined
  }
}

export const convertRuleToString = (rule: RuleItem): string => {
  const parts = [rule.type]
  if (rule.type === 'MATCH') {
    parts.push(rule.proxy || 'DIRECT')
  } else {
    parts.push(rule.payload || '')
    parts.push(rule.proxy || 'DIRECT')
  }
  if (rule.additionalParams && rule.additionalParams.length > 0) {
    parts.push(...rule.additionalParams)
  }
  return parts.join(',')
}

export const builtinProxyTargets = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE']

export const collectProxyGroups = (parsed: unknown): string[] => {
  const groups: string[] = []
  if (parsed && typeof parsed === 'object') {
    const collectNames = (val: unknown): void => {
      if (!Array.isArray(val)) return
      val.forEach((item) => {
        const name = (item as Record<string, unknown> | null)?.['name']
        if (typeof name === 'string' && name) groups.push(name)
      })
    }
    collectNames((parsed as Record<string, unknown>)['proxy-groups'])
    collectNames((parsed as Record<string, unknown>)['proxies'])
  }
  groups.push(...builtinProxyTargets)
  return [...new Set(groups)]
}

