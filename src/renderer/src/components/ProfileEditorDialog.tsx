import React, { lazy, Suspense, useEffect, useState, useCallback, useRef, useMemo, startTransition } from 'react'
import yaml from 'yaml'
import {
  CodeXml,
  Check,
  AlertCircle,
  LoaderCircle,
  Code,
  ListTree,
  ArrowUpToLine,
  ArrowDownToLine,
  Trash2,
  Undo2,
  Search,
  ChevronDown,
  ChevronUp,
  GripVertical,
  HelpCircle,
  X
} from 'lucide-react'
import type { ProfileItem, CustomRuleItem } from '@shared/profile'
import { useLocale, useTranslations } from '../i18n'
import { EmojiText } from './EmojiText'
import { profileName } from '../lib/profile-name'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Switch } from './ui/switch'
import { cn } from '../lib/utils'

const YamlEditor = lazy(() => import('./YamlEditor'))

interface ProfileEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileItem | null
  onSaved: () => void
}

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
}

type RuleDraft = Omit<RuleItem, 'id'>

const createRuleId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `rule-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

const logicalRuleTypes = new Set(['AND', 'OR', 'NOT'])
const isLogicalRuleType = (ruleType: string): boolean => logicalRuleTypes.has(ruleType.toUpperCase())

const splitByTopLevelCommas = (value: string): string[] => {
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

const isFullyWrappedByParentheses = (value: string): boolean => {
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

const unwrapFullyWrappedParentheses = (value: string): string => {
  let result = value.trim()
  while (isFullyWrappedByParentheses(result)) {
    result = result.slice(1, -1).trim()
  }
  return result
}

const getLogicalRuleClauses = (payload: string): string[] => {
  const normalized = unwrapFullyWrappedParentheses(payload)
  if (!normalized) return []
  return splitByTopLevelCommas(normalized)
    .map((clause) => unwrapFullyWrappedParentheses(clause).trim())
    .filter(Boolean)
}

const formatLogicalRuleClause = (clause: string): string => {
  const parts = splitByTopLevelCommas(clause).map((p) => p.trim())
  if (parts.length <= 1) return clause
  const [cType, ...cValues] = parts
  return cValues.length > 0 ? `${cType}: ${cValues.join(', ')}` : cType
}

const domainValidator = (value: string): boolean => {
  if (value.length > 253 || value.length < 2) return false
  return (
    /^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)\.)+[a-zA-Z]{2,}$/.test(value) ||
    ['localhost', 'local', 'localdomain'].includes(value.toLowerCase())
  )
}

const domainSuffixValidator = (value: string): boolean => {
  return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(
    value
  )
}

const domainKeywordValidator = (value: string): boolean => {
  return value.length > 0 && !value.includes(',') && !value.includes(' ')
}

const domainRegexValidator = (value: string): boolean => {
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

const portValidator = (value: string): boolean => {
  return /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/.test(value)
}

const ipv4CIDRValidator = (value: string): boolean => {
  return /^(?:(?:[1-9]?[0-9]|1[0-9][0-9]|2(?:[0-4][0-9]|5[0-5]))\.){3}(?:[1-9]?[0-9]|1[0-9][0-9]|2(?:[0-4][0-9]|5[0-5]))(?:\/(?:[12]?[0-9]|3[0-2]))$/.test(
    value
  )
}

const ipv6CIDRValidator = (value: string): boolean => {
  return /^([0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){7}|::|:(?::[0-9a-fA-F]{1,4}){1,6}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,5}|(?:[0-9a-fA-F]{1,4}:){2}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){3}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){4}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){5}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:)\/(?:12[0-8]|1[01][0-9]|[1-9]?[0-9])$/.test(
    value
  )
}

export const ruleDefinitionsMap = new Map<
  string,
  {
    name: string
    example?: string
    noResolve?: boolean
    src?: boolean
    validator?: (value: string) => boolean
  }
>([
  ['DOMAIN', { name: 'DOMAIN', example: 'example.com', validator: domainValidator }],
  ['DOMAIN-SUFFIX', { name: 'DOMAIN-SUFFIX', example: 'example.com', validator: domainSuffixValidator }],
  ['DOMAIN-KEYWORD', { name: 'DOMAIN-KEYWORD', example: 'example', validator: domainKeywordValidator }],
  ['DOMAIN-REGEX', { name: 'DOMAIN-REGEX', example: 'example.*', validator: domainRegexValidator }],
  ['GEOSITE', { name: 'GEOSITE', example: 'youtube' }],
  ['GEOIP', { name: 'GEOIP', example: 'RU', noResolve: true, src: true }],
  ['SRC-GEOIP', { name: 'SRC-GEOIP', example: 'RU' }],
  ['IP-ASN', { name: 'IP-ASN', example: '13335', noResolve: true, src: true, validator: (v) => !!+v }],
  ['SRC-IP-ASN', { name: 'SRC-IP-ASN', example: '9808', validator: (v) => !!+v }],
  [
    'IP-CIDR',
    {
      name: 'IP-CIDR',
      example: '192.168.1.0/24',
      noResolve: true,
      src: true,
      validator: (v) => ipv4CIDRValidator(v) || ipv6CIDRValidator(v)
    }
  ],
  [
    'IP-CIDR6',
    {
      name: 'IP-CIDR6',
      example: '2620:0:2d0:200::7/32',
      noResolve: true,
      src: true,
      validator: (v) => ipv4CIDRValidator(v) || ipv6CIDRValidator(v)
    }
  ],
  [
    'SRC-IP-CIDR',
    {
      name: 'SRC-IP-CIDR',
      example: '192.168.1.201/32',
      validator: (v) => ipv4CIDRValidator(v) || ipv6CIDRValidator(v)
    }
  ],
  [
    'IP-SUFFIX',
    {
      name: 'IP-SUFFIX',
      example: '8.8.8.8/24',
      noResolve: true,
      src: true,
      validator: (v) => ipv4CIDRValidator(v) || ipv6CIDRValidator(v)
    }
  ],
  [
    'SRC-IP-SUFFIX',
    {
      name: 'SRC-IP-SUFFIX',
      example: '192.168.1.201/8',
      validator: (v) => ipv4CIDRValidator(v) || ipv6CIDRValidator(v)
    }
  ],
  ['SRC-PORT', { name: 'SRC-PORT', example: '7777', validator: portValidator }],
  ['DST-PORT', { name: 'DST-PORT', example: '80', validator: portValidator }],
  ['IN-PORT', { name: 'IN-PORT', example: '7897', validator: portValidator }],
  ['DSCP', { name: 'DSCP', example: '4' }],
  ['PROCESS-NAME', { name: 'PROCESS-NAME', example: 'chrome.exe' }],
  ['PROCESS-PATH', { name: 'PROCESS-PATH', example: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }],
  ['PROCESS-NAME-REGEX', { name: 'PROCESS-NAME-REGEX', example: '.*telegram.*' }],
  ['PROCESS-PATH-REGEX', { name: 'PROCESS-PATH-REGEX', example: '(?i).*Application\\\\chrome.*' }],
  ['NETWORK', { name: 'NETWORK', example: 'udp', validator: (v) => ['tcp', 'udp'].includes(v.toLowerCase()) }],
  ['UID', { name: 'UID', example: '1001', validator: (v) => !!+v }],
  ['IN-TYPE', { name: 'IN-TYPE', example: 'SOCKS/HTTP' }],
  ['IN-USER', { name: 'IN-USER', example: 'mihomo' }],
  ['IN-NAME', { name: 'IN-NAME', example: 'ss' }],
  ['SUB-RULE', { name: 'SUB-RULE', example: '(NETWORK,tcp)' }],
  ['RULE-SET', { name: 'RULE-SET', example: 'providername', noResolve: true, src: true }],
  ['AND', { name: 'AND', example: '((DOMAIN,example.com),(NETWORK,UDP))', validator: (v) => getLogicalRuleClauses(v).length >= 2 }],
  ['OR', { name: 'OR', example: '((NETWORK,UDP),(DOMAIN,example.com))', validator: (v) => getLogicalRuleClauses(v).length >= 2 }],
  ['NOT', { name: 'NOT', example: '((DOMAIN,example.com))', validator: (v) => getLogicalRuleClauses(v).length >= 1 }],
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
      offset: offset && offset > 0 ? offset : undefined
    }
  }

  return {
    id: createRuleId(),
    type: normalizedType || type,
    payload,
    proxy: proxy || 'DIRECT',
    additionalParams: additionalParamsRaw.filter(Boolean),
    isCustom,
    offset: offset && offset > 0 ? offset : undefined
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

export const ProfileEditorDialog: React.FC<ProfileEditorDialogProps> = ({
  open,
  onOpenChange,
  profile,
  onSaved
}) => {
  const t = useTranslations('profiles')
  const locale = useLocale()

  // Navigation mode: 'visual' (Visual Rules) | 'yaml' (Rules YAML) | 'file' (Profile Raw Config YAML)
  const [activeMode, setActiveMode] = useState<'visual' | 'yaml'>('visual')

  // Rules state
  const [rules, setRules] = useState<RuleItem[]>([])
  const [initialBaseRulesCount, setInitialBaseRulesCount] = useState(0)
  const [proxyGroups, setProxyGroups] = useState<string[]>([...builtinProxyTargets])
  const [searchQuery, setSearchQuery] = useState('')

  // New rule draft (left column)
  const [newRule, setNewRule] = useState<RuleDraft>({
    type: 'DOMAIN-SUFFIX',
    payload: '',
    proxy: 'DIRECT',
    additionalParams: []
  })

  // Inline editing state (right column)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<RuleItem | null>(null)

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // Instructions accordion
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  // Raw file editor & Diff mode switches
  const [originalRawConfig, setOriginalRawConfig] = useState('')
  const [rawConfigContent, setRawConfigContent] = useState('')
  const [rulesYamlContent, setRulesYamlContent] = useState('')
  const [isDiff, setIsDiff] = useState(false)
  const [sideBySide, setSideBySide] = useState(true)

  // Loading & error state
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  // Serialize current rules state into YAML overrides
  const yamlMessages = useRef(t)
  yamlMessages.current = t
  const serializeRulesToYaml = useCallback((ruleList: RuleItem[]): string => {
    const prepend: string[] = []
    const append: string[] = []
    const deleted: string[] = []

    for (const r of ruleList) {
      if (r.isCustom && !r.isDeleted) {
        if (r.position === 'bottom') {
          append.push(convertRuleToString(r))
        } else {
          prepend.push(convertRuleToString(r))
        }
      } else if (!r.isCustom && r.isDeleted) {
        deleted.push(convertRuleToString(r))
      }
    }

    const doc = [
      '# ' + yamlMessages.current('yamlRulesComment'),
      '# ' + yamlMessages.current('yamlPrependComment'),
      '# ' + yamlMessages.current('yamlAppendComment'),
      '# ' + yamlMessages.current('yamlDeleteComment'),
      ''
    ]

    const obj: Record<string, string[]> = {}
    if (prepend.length > 0) obj['prepend'] = prepend
    if (append.length > 0) obj['append'] = append
    if (deleted.length > 0) obj['delete'] = deleted

    if (Object.keys(obj).length === 0) {
      doc.push('# ' + yamlMessages.current('yamlExamplesComment'))
      doc.push('# prepend:')
      doc.push('#   - DOMAIN-SUFFIX,google.com,PROXY')
      doc.push('# append:')
      doc.push('#   - IP-CIDR,192.168.1.0/24,DIRECT')
      doc.push('# delete:')
      doc.push('#   - MATCH,DIRECT')
      doc.push('')
      doc.push('prepend: []')
      doc.push('append: []')
      doc.push('delete: []')
      return doc.join('\n')
    }

    return doc.join('\n') + yaml.stringify(obj)
  }, [])

  // Parse YAML back into visual rules
  const parseYamlToVisualRules = useCallback(
    (yamlStr: string, baseRuleList: RuleItem[]): RuleItem[] => {
      const parsed = yaml.parse(yamlStr) as Record<string, unknown> | null
      const baseClean = baseRuleList.map((r) => ({ ...r, isDeleted: false }))

      if (!parsed || typeof parsed !== 'object') {
        return baseClean
      }

      const toStrings = (val: unknown): string[] => {
        if (!Array.isArray(val)) return []
        return val.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      }

      const prependStrs = toStrings(parsed['prepend'])
      const appendStrs = toStrings(parsed['append'])
      const deleteStrs = toStrings(parsed['delete'])

      // Also support legacy/simple `rules:` array
      const directRules = toStrings(parsed['rules'])
      if (directRules.length > 0 && prependStrs.length === 0 && appendStrs.length === 0) {
        return [
          ...directRules.map((str) => ({ ...parseRuleStringToItem(str, true), position: 'top' as const })),
          ...baseClean
        ]
      }

      // Mark deleted
      const updated: RuleItem[] = baseClean.map((rule) => {
        const isDel = deleteStrs.some((delStr) => {
          const dItem = parseRuleStringToItem(delStr)
          return (
            dItem.type === rule.type &&
            dItem.payload === rule.payload &&
            (!dItem.proxy || dItem.proxy === rule.proxy)
          )
        })
        return isDel ? { ...rule, isDeleted: true } : { ...rule }
      })

      const topItems: RuleItem[] = prependStrs.map((str) => ({
        ...parseRuleStringToItem(str, true),
        position: 'top'
      }))

      const bottomItems: RuleItem[] = appendStrs.map((str) => ({
        ...parseRuleStringToItem(str, true),
        position: 'bottom'
      }))

      const lastMatchIdx = updated.findLastIndex((r) => r.type === 'MATCH')
      if (lastMatchIdx !== -1 && bottomItems.length > 0) {
        updated.splice(lastMatchIdx, 0, ...bottomItems)
      } else {
        updated.push(...bottomItems)
      }

      return [...topItems, ...updated]
    },
    []
  )

  // Load profile data when dialog opens
  useEffect(() => {
    if (!open || !profile || !window.api) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setActiveMode('visual')

    Promise.all([
      window.api.profiles.getCustomRules(profile.id).catch(() => []),
      window.api.profiles.getRawConfig(profile.id).catch(() => '')
    ]).then(([customRules, rawConfig]) => {
      if (cancelled) return


      let parsedProfileYaml: Record<string, unknown> | null
      try {
        parsedProfileYaml = yaml.parse(rawConfig || '') as Record<string, unknown>
      } catch {
        parsedProfileYaml = null
      }

      // Collect proxy groups
      const groups = collectProxyGroups(parsedProfileYaml)
      setProxyGroups(groups)

      // Parse base rules
      const baseRawRules: string[] = []
      if (parsedProfileYaml && Array.isArray(parsedProfileYaml['rules'])) {
        for (const item of parsedProfileYaml['rules']) {
          if (typeof item === 'string' && item.trim()) baseRawRules.push(item.trim())
        }
      }

      const parsedBase: RuleItem[] = baseRawRules.map((str) => parseRuleStringToItem(str, false))
      setInitialBaseRulesCount(parsedBase.length)

      // Merge user custom rules
      const cRules = (customRules || []) as CustomRuleItem[]
      const topItems: RuleItem[] = []
      const bottomItems: RuleItem[] = []
      const deletedSignatures = new Set<string>()

      for (const cr of cRules) {
        if (cr.isDeleted) {
          deletedSignatures.add(`${(cr.type || '').toUpperCase()}|${cr.payload || ''}|${cr.proxy || ''}`)
        } else if (cr.enabled !== false) {
          const item: RuleItem = {
            id: cr.id || createRuleId(),
            type: (cr.type || 'DOMAIN-SUFFIX').toUpperCase(),
            payload: cr.payload || '',
            proxy: cr.proxy || 'DIRECT',
            additionalParams: cr.additionalParams || [],
            position: cr.position === 'bottom' ? 'bottom' : 'top',
            isCustom: true,
            isDeleted: false
          }
          if (cr.position === 'bottom') {
            bottomItems.push(item)
          } else {
            topItems.push(item)
          }
        }
      }

      // Mark base rules deleted if in deleted signatures
      const updatedBase = parsedBase.map((r) => {
        const sigExact = `${r.type}|${r.payload}|${r.proxy}`
        const sigAnyProxy = `${r.type}|${r.payload}|`
        if (deletedSignatures.has(sigExact) || deletedSignatures.has(sigAnyProxy)) {
          return { ...r, isDeleted: true }
        }
        return r
      })

      // Insert bottom rules before MATCH
      const lastMatch = updatedBase.findLastIndex((r) => r.type === 'MATCH')
      if (lastMatch !== -1 && bottomItems.length > 0) {
        updatedBase.splice(lastMatch, 0, ...bottomItems)
      } else {
        updatedBase.push(...bottomItems)
      }

      const mergedRules = [...topItems, ...updatedBase]
      setRules(mergedRules)
      setRulesYamlContent(serializeRulesToYaml(mergedRules))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open, profile, serializeRulesToYaml])

  // Switch modes and sync content
  const handleModeChange = (newMode: 'visual' | 'yaml') => {
    if (newMode === activeMode) return
    setError(null)

    if (activeMode === 'visual' && newMode === 'yaml') {
      setRulesYamlContent(serializeRulesToYaml(rules))
    } else if (activeMode === 'yaml' && newMode === 'visual') {
      try {
        yaml.parse(rulesYamlContent)
        const updated = parseYamlToVisualRules(rulesYamlContent, rules.filter((r) => !r.isCustom))
        setRules(updated)
      } catch (err) {
        setError(t('invalidYaml', { error: err instanceof Error ? err.message : String(err) }))
        return
      }
    }

    setActiveMode(newMode)
  }

  // Validate payload
  const validatePayload = useCallback((type: string, payload: string): boolean => {
    const norm = type.toUpperCase()
    if (norm === 'MATCH') return true
    const def = ruleDefinitionsMap.get(norm)
    if (!def?.validator) return true
    return def.validator(payload.trim())
  }, [])

  const isNewPayloadValid = useMemo(() => {
    if (newRule.type === 'MATCH' || !newRule.payload) return true
    return validatePayload(newRule.type, newRule.payload)
  }, [newRule.type, newRule.payload, validatePayload])

  const isNewRuleLogical = isLogicalRuleType(newRule.type)
  const newRuleLogicalSummary = useMemo(() => {
    if (!isNewRuleLogical) return []
    return getLogicalRuleClauses(newRule.payload).map(formatLogicalRuleClause)
  }, [isNewRuleLogical, newRule.payload])

  // Add rule action
  const handleAddRule = (position: 'top' | 'bottom') => {
    if (newRule.type !== 'MATCH' && !newRule.payload.trim()) return
    if (!isNewPayloadValid) return

    const newItem: RuleItem = {
      id: createRuleId(),
      type: newRule.type.toUpperCase(),
      payload: newRule.type === 'MATCH' ? '' : newRule.payload.trim(),
      proxy: newRule.proxy || 'DIRECT',
      additionalParams: [...(newRule.additionalParams || [])],
      position,
      isCustom: true,
      isDeleted: false
    }

    startTransition(() => {
      setRules((prev) => {
        const next = [...prev]
        if (position === 'top') {
          next.unshift(newItem)
        } else {
          const matchIdx = next.findLastIndex((r) => r.type === 'MATCH')
          if (matchIdx !== -1) {
            next.splice(matchIdx, 0, newItem)
          } else {
            next.push(newItem)
          }
        }
        return next
      })
    })

    // Reset draft payload
    setNewRule((prev) => ({ ...prev, payload: '' }))
  }

  // Delete or restore rule
  const handleToggleDelete = (ruleId: string) => {
    setRules((prev) => {
      return prev
        .map((r) => {
          if (r.id !== ruleId) return r
          if (r.isCustom) {
            // Remove custom rule completely
            return null
          }
          // Toggle deleted flag for base rule
          return { ...r, isDeleted: !r.isDeleted }
        })
        .filter((r): r is RuleItem => r !== null)
    })
  }

  // Reorder rules up/down
  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= rules.length) return

    setRules((prev) => {
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(targetIndex, 0, item)
      return copy
    })
  }

  // Native HTML5 Drag and drop reordering
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    setRules((prev) => {
      const copy = [...prev]
      const [dragged] = copy.splice(draggedIndex, 1)
      copy.splice(index, 0, dragged)
      return copy
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  // Inline editing actions
  const startInlineEdit = (rule: RuleItem) => {
    if (rule.isDeleted) return
    setEditingId(rule.id)
    setEditingDraft({ ...rule, additionalParams: [...(rule.additionalParams || [])] })
  }

  const cancelInlineEdit = () => {
    setEditingId(null)
    setEditingDraft(null)
  }

  const saveInlineEdit = () => {
    if (!editingDraft) return
    if (editingDraft.type !== 'MATCH' && editingDraft.payload.trim() && !validatePayload(editingDraft.type, editingDraft.payload)) {
      setError(`${t('invalidPayload')}: ${getRuleExample(editingDraft.type)}`)
      return
    }

    setRules((prev) =>
      prev.map((r) => (r.id === editingDraft.id ? { ...editingDraft, payload: editingDraft.payload.trim() } : r))
    )
    setEditingId(null)
    setEditingDraft(null)
    setError(null)
  }

  // Save changes to backend
  const handleSave = useCallback(async () => {
    if (!profile || !window.api || saving) return

    setError(null)
    setSaving(true)

    try {
      let rulesToSave = rules
      if (activeMode === 'yaml') {
        try {
          yaml.parse(rulesYamlContent)
          rulesToSave = parseYamlToVisualRules(rulesYamlContent, rules.filter((r) => !r.isCustom))
        } catch (yamlErr) {
          setError(
            t('invalidYaml', {
              error: yamlErr instanceof Error ? yamlErr.message : String(yamlErr)
            })
          )
          setSaving(false)
          return
        }
      }

      // Convert rules to CustomRuleItem[]
      const customItems: CustomRuleItem[] = []
      for (const r of rulesToSave) {
        if (r.isCustom && !r.isDeleted) {
          customItems.push({
            id: r.id,
            type: r.type,
            payload: r.payload,
            proxy: r.proxy,
            position: r.position || 'top',
            additionalParams: r.additionalParams,
            enabled: true
          })
        } else if (!r.isCustom && r.isDeleted) {
          customItems.push({
            id: r.id,
            type: r.type,
            payload: r.payload,
            proxy: r.proxy,
            isDeleted: true,
            enabled: true
          })
        }
      }

      await window.api.profiles.saveCustomRules(profile.id, customItems)

      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    profile,
    saving,
    activeMode,
    rules,
    rulesYamlContent,
    parseYamlToVisualRules,
    onSaved,
    onOpenChange,
    t
  ])

  // Filtered rules for search
  const filteredRules = useMemo(() => {
    if (!searchQuery.trim()) return rules
    const q = searchQuery.toLowerCase().trim()
    return rules.filter(
      (r) =>
        r.type.toLowerCase().includes(q) ||
        r.payload.toLowerCase().includes(q) ||
        r.proxy.toLowerCase().includes(q) ||
        (r.additionalParams || []).some((p) => p.toLowerCase().includes(q))
    )
  }, [rules, searchQuery])

  const customRulesCount = useMemo(() => rules.filter((r) => r.isCustom && !r.isDeleted).length, [rules])
  const deletedRulesCount = useMemo(() => rules.filter((r) => !r.isCustom && r.isDeleted).length, [rules])

  if (!profile) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[92vh] max-h-[94vh] flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
        {/* Header */}
        <DialogHeader className="pb-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <CodeXml className="size-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm font-semibold truncate">
                    <EmojiText text={profileName(profile, locale)} />
                  </DialogTitle>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                    {profile.type}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {t('rulesAndConfigEditor')}
                </p>
              </div>
            </div>

            {/* Mode Switcher Buttons (Visual / YAML) */}
            <div className="flex items-center rounded-lg border border-border/80 p-0.5 bg-muted/40 shrink-0">
              <button
                type="button"
                onClick={() => handleModeChange('visual')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer',
                  activeMode === 'visual'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ListTree className="size-3.5" />
                <span>{t('visualMode')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('yaml')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer',
                  activeMode === 'yaml'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Code className="size-3.5" />
                <span>{t('yamlMode')}</span>
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Error notification banner */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md shrink-0">
            <AlertCircle className="size-4 shrink-0" />
            <span className="font-mono truncate">{error}</span>
          </div>
        )}

        {/* Main Content Area */}
        <div className="relative flex-1 min-h-0 w-full overflow-hidden flex flex-col">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
              <LoaderCircle className="size-7 animate-spin text-primary" />
            </div>
          )}

          {/* Visual Rules Editor */}
          <div className={cn("flex flex-col md:flex-row gap-4 h-full min-h-0", activeMode !== 'visual' && "hidden")}>
            {/* Left Panel: Create & Configure Rule */}
            <div className="w-full md:w-[360px] lg:w-[390px] shrink-0 flex flex-col gap-3 overflow-y-auto pr-1 min-h-0">
              <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3.5 shadow-xs">
                {/* Rule Type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground">{t('ruleType')}</label>
                  <select
                    value={newRule.type}
                    onChange={(e) => {
                      const sel = e.target.value
                      let extra = [...(newRule.additionalParams || [])]
                      if (!isRuleSupportsNoResolve(sel)) extra = extra.filter((p) => p !== 'no-resolve')
                      if (!isRuleSupportsSrc(sel)) extra = extra.filter((p) => p !== 'src')
                      setNewRule({ ...newRule, type: sel, additionalParams: extra })
                    }}
                    className="h-8.5 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-mono"
                  >
                    {ruleTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payload */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground">{t('payload')}</label>
                  {isNewRuleLogical ? (
                    <Textarea
                      placeholder={getRuleExample(newRule.type) || t('payloadPlaceholder')}
                      value={newRule.payload}
                      onChange={(e) => setNewRule({ ...newRule, payload: e.target.value })}
                      disabled={newRule.type === 'MATCH'}
                      rows={3}
                      className={cn(
                        'text-xs font-mono resize-y',
                        newRule.payload && newRule.type !== 'MATCH' && !isNewPayloadValid
                          ? 'border-destructive focus-visible:ring-destructive'
                          : ''
                      )}
                    />
                  ) : (
                    <Input
                      placeholder={getRuleExample(newRule.type) || t('payloadPlaceholder')}
                      value={newRule.payload}
                      onChange={(e) => setNewRule({ ...newRule, payload: e.target.value })}
                      disabled={newRule.type === 'MATCH'}
                      className={cn(
                        'h-8.5 text-xs font-mono',
                        newRule.payload && newRule.type !== 'MATCH' && !isNewPayloadValid
                          ? 'border-destructive focus-visible:ring-destructive'
                          : ''
                      )}
                    />
                  )}

                  {/* Logical clauses previews */}
                  {isNewRuleLogical && newRuleLogicalSummary.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {newRuleLogicalSummary.slice(0, 3).map((clause, idx) => (
                        <Badge key={idx} variant="outline" className="text-[10px] truncate max-w-[180px]">
                          {clause}
                        </Badge>
                      ))}
                      {newRuleLogicalSummary.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{newRuleLogicalSummary.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Format error hint */}
                  {newRule.payload && newRule.type !== 'MATCH' && !isNewPayloadValid && (
                    <p className="text-[11px] text-destructive">
                      {t('expectedFormat')}: {getRuleExample(newRule.type)}
                    </p>
                  )}
                </div>

                {/* Proxy / Target Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground">{t('proxyTarget')}</label>
                  <select
                    value={newRule.proxy}
                    onChange={(e) => setNewRule({ ...newRule, proxy: e.target.value })}
                    className="h-8.5 rounded-md border border-input bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-mono"
                  >
                    {proxyGroups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Additional Options (Switches) */}
                {(isRuleSupportsNoResolve(newRule.type) || isRuleSupportsSrc(newRule.type)) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 ">
                    {isRuleSupportsNoResolve(newRule.type) && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <Switch
                          checked={newRule.additionalParams?.includes('no-resolve') || false}
                          onCheckedChange={(checked) => {
                            let params = [...(newRule.additionalParams || [])]
                            if (checked) {
                              if (!params.includes('no-resolve')) params.push('no-resolve')
                            } else {
                              params = params.filter((p) => p !== 'no-resolve')
                            }
                            setNewRule({ ...newRule, additionalParams: params })
                          }}
                        />
                        <span>no-resolve</span>
                      </label>
                    )}
                    {isRuleSupportsSrc(newRule.type) && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                        <Switch
                          checked={newRule.additionalParams?.includes('src') || false}
                          onCheckedChange={(checked) => {
                            let params = [...(newRule.additionalParams || [])]
                            if (checked) {
                              if (!params.includes('src')) params.push('src')
                            } else {
                              params = params.filter((p) => p !== 'src')
                            }
                            setNewRule({ ...newRule, additionalParams: params })
                          }}
                        />
                        <span>src</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Action Buttons: Add Prepend / Add Append */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => handleAddRule('top')}
                    disabled={newRule.type !== 'MATCH' && (!newRule.payload.trim() || !isNewPayloadValid)}
                    className="flex-1 gap-1.5"
                  >
                    <ArrowUpToLine className="size-3.5" />
                    <span className="truncate">{t('addRulePrepend')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddRule('bottom')}
                    disabled={newRule.type !== 'MATCH' && (!newRule.payload.trim() || !isNewPayloadValid)}
                    className="flex-1 gap-1.5"
                  >
                    <ArrowDownToLine className="size-3.5" />
                    <span className="truncate">{t('addRuleAppend')}</span>
                  </Button>
                </div>
              </div>

              {/* Collapsible Rules Guide Accordion */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
                <button
                  type="button"
                  onClick={() => setInstructionsOpen(!instructionsOpen)}
                  className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <HelpCircle className="size-3.5 text-primary" />
                    <span>{t('instructions')}</span>
                  </div>
                  <ChevronDown
                    className={cn('size-3.5 transition-transform duration-200', instructionsOpen && 'rotate-180')}
                  />
                </button>
                {instructionsOpen && (
                  <div className="mt-2 text-[11px] text-muted-foreground space-y-1.5 leading-relaxed pt-2 ">
                    <p>• {t('instructions1')}</p>
                    <p>• {t('instructions2')}</p>
                    <p>• {t('instructions3')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Current Rules List */}
            <div className="flex-1 min-w-0 md:pl-4 pt-3 md:pt-0 flex flex-col min-h-0">
              {/* Search & Statistics Bar */}
              <div className="flex items-center justify-between gap-2.5 pb-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('currentRules')}
                  </h3>
                  <Badge variant="secondary" className="text-[11px] font-mono px-1.5 py-0">
                    {rules.length}
                  </Badge>
                  {customRulesCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono px-1.5 py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
                    >
                      +{customRulesCount}
                    </Badge>
                  )}
                  {deletedRulesCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono px-1.5 py-0 text-destructive border-destructive/40 bg-destructive/10"
                    >
                      -{deletedRulesCount}
                    </Badge>
                  )}
                </div>

                <div className="relative w-48 sm:w-64">
                  <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    placeholder={t('searchRulesPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-xs font-mono"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Rules Scrollable Container */}
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto pr-1 flex flex-col gap-1.5">
                {filteredRules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs text-center">
                    <ListTree className="size-8 mb-2 opacity-30" />
                    <span>{searchQuery ? t('noMatchingRules') : t('noRules')}</span>
                  </div>
                ) : (
                  filteredRules.map((rule, idx) => {
                    const isEditing = editingId === rule.id
                    const isDeleted = rule.isDeleted === true

                    if (isEditing && editingDraft) {
                      // Inline Editing Mode
                      const isLogical = isLogicalRuleType(editingDraft.type)

                      return (
                        <div
                          key={rule.id}
                          className="p-3 rounded-lg border-2 border-primary/60 bg-primary/5 flex flex-col gap-2.5 shadow-xs min-w-0"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr_140px] gap-2 items-start min-w-0">
                            {/* Type */}
                            <select
                              value={editingDraft.type}
                              onChange={(e) => {
                                const sel = e.target.value
                                let extra = [...(editingDraft.additionalParams || [])]
                                if (!isRuleSupportsNoResolve(sel)) extra = extra.filter((p) => p !== 'no-resolve')
                                if (!isRuleSupportsSrc(sel)) extra = extra.filter((p) => p !== 'src')
                                setEditingDraft({ ...editingDraft, type: sel, additionalParams: extra })
                              }}
                              className="h-8 rounded-md border border-input bg-card px-2 text-xs font-mono w-full"
                            >
                              {ruleTypes.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>

                            {/* Payload */}
                            {isLogical ? (
                              <Textarea
                                value={editingDraft.payload}
                                onChange={(e) => setEditingDraft({ ...editingDraft, payload: e.target.value })}
                                rows={2}
                                disabled={editingDraft.type === 'MATCH'}
                                className="text-xs font-mono w-full min-w-0 break-all resize-y"
                                autoFocus
                              />
                            ) : (
                              <Input
                                value={editingDraft.payload}
                                onChange={(e) => setEditingDraft({ ...editingDraft, payload: e.target.value })}
                                disabled={editingDraft.type === 'MATCH'}
                                className="h-8 text-xs font-mono w-full min-w-0 break-all"
                                autoFocus
                              />
                            )}

                            {/* Proxy */}
                            <select
                              value={editingDraft.proxy}
                              onChange={(e) => setEditingDraft({ ...editingDraft, proxy: e.target.value })}
                              className="h-8 rounded-md border border-input bg-card px-2 text-xs font-mono w-full"
                            >
                              {proxyGroups.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Options & Action buttons */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 ">
                            <div className="flex items-center gap-3">
                              {isRuleSupportsNoResolve(editingDraft.type) && (
                                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                  <Switch
                                    checked={editingDraft.additionalParams?.includes('no-resolve') || false}
                                    onCheckedChange={(checked) => {
                                      let p = [...(editingDraft.additionalParams || [])]
                                      if (checked) {
                                        if (!p.includes('no-resolve')) p.push('no-resolve')
                                      } else {
                                        p = p.filter((x) => x !== 'no-resolve')
                                      }
                                      setEditingDraft({ ...editingDraft, additionalParams: p })
                                    }}
                                  />
                                  <span>no-resolve</span>
                                </label>
                              )}
                              {isRuleSupportsSrc(editingDraft.type) && (
                                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                  <Switch
                                    checked={editingDraft.additionalParams?.includes('src') || false}
                                    onCheckedChange={(checked) => {
                                      let p = [...(editingDraft.additionalParams || [])]
                                      if (checked) {
                                        if (!p.includes('src')) p.push('src')
                                      } else {
                                        p = p.filter((x) => x !== 'src')
                                      }
                                      setEditingDraft({ ...editingDraft, additionalParams: p })
                                    }}
                                  />
                                  <span>src</span>
                                </label>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                {t('ctrlEnterHint')}
                              </span>
                              <Button size="sm" variant="ghost" onClick={cancelInlineEdit} className="h-7 text-xs">
                                <X className="size-3.5" />
                                <span>{t('cancel')}</span>
                              </Button>
                              <Button size="sm" variant="glow" onClick={saveInlineEdit} className="h-7 text-xs">
                                <Check className="size-3.5" />
                                <span>{t('saveSubscription')}</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Normal Item Card
                    return (
                      <div
                        key={rule.id}
                        draggable={!searchQuery && !isDeleted}
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        onClick={() => !isDeleted && startInlineEdit(rule)}
                        className={cn(
                          'group flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer min-w-0',
                          isDeleted && 'bg-destructive/10 opacity-60 border-destructive/20 cursor-not-allowed',
                          !isDeleted &&
                            rule.isCustom &&
                            'bg-emerald-500/8 border-emerald-500/25 hover:border-emerald-500/50 hover:bg-emerald-500/12',
                          !isDeleted &&
                            !rule.isCustom &&
                            'bg-card/50 border-border/50 hover:border-border hover:bg-card/90',
                          draggedIndex === idx && 'opacity-30'
                        )}
                      >
                        {/* Drag handle */}
                        {!searchQuery && !isDeleted && (
                          <div
                            className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing shrink-0 pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVertical className="size-3.5" />
                          </div>
                        )}

                        {/* Quick Up/Down buttons */}
                        {!searchQuery && !isDeleted && (
                          <div
                            className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleMoveRule(idx, 'up')}
                              disabled={idx === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronUp className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveRule(idx, 'down')}
                              disabled={idx === rules.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronDown className="size-3" />
                            </button>
                          </div>
                        )}

                        {/* Type badge + parameters */}
                        <div className="flex flex-wrap items-center gap-1 shrink-0 pt-0.5 max-w-[140px]">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] font-mono font-medium px-1.5 py-0.5',
                              rule.isCustom && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent'
                            )}
                          >
                            {rule.type}
                          </Badge>
                          {rule.additionalParams?.map((p, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] font-mono px-1 py-0">
                              {p}
                            </Badge>
                          ))}
                        </div>

                        {/* Payload */}
                        <div className="flex-1 min-w-0 py-0.5">
                          <p
                            className={cn(
                              'text-xs font-mono font-medium break-all whitespace-normal leading-relaxed',
                              isDeleted && 'line-through text-muted-foreground'
                            )}
                            title={rule.payload || (rule.type === 'MATCH' ? rule.proxy : '')}
                          >
                            {rule.type === 'MATCH' ? rule.proxy : rule.payload || '*'}
                          </p>
                        </div>

                        {/* Proxy target */}
                        <div className="shrink-0 text-right pt-0.5 max-w-[120px]">
                          <span
                            className={cn(
                              'text-xs font-medium px-2 py-0.5 rounded-md font-mono inline-block truncate max-w-full',
                              rule.proxy === 'DIRECT'
                                ? 'bg-muted text-muted-foreground'
                                : rule.proxy === 'REJECT' || rule.proxy === 'REJECT-DROP'
                                  ? 'bg-destructive/15 text-destructive font-semibold'
                                  : 'bg-primary/10 text-primary font-semibold',
                              isDeleted && 'line-through opacity-50'
                            )}
                            title={rule.proxy}
                          >
                            {rule.proxy}
                          </span>
                        </div>

                        {/* Delete / Restore button */}
                        <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleToggleDelete(rule.id)
                            }}
                            className={cn(
                              'hover:bg-transparent cursor-pointer',
                              isDeleted ? 'text-emerald-500 hover:text-emerald-600' : 'text-destructive hover:text-destructive/80'
                            )}
                            title={isDeleted ? t('restore') : t('delete')}
                          >
                            {isDeleted ? <Undo2 className="size-3.5" /> : <Trash2 className="size-3.5" />}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Import and mount Monaco only after the YAML mode is selected. */}
          {activeMode === 'yaml' && (
            <div className="relative flex-1 min-h-0 w-full rounded-lg border border-border/70 overflow-hidden bg-[#1e1e1e] flex flex-col">
              <Suspense fallback={<div role="status" className="flex h-full items-center justify-center"><LoaderCircle className="size-6 animate-spin text-primary" /></div>}>
                <YamlEditor
                  theme={isDark ? 'vs-dark' : 'light'}
                  value={rulesYamlContent}
                  onChange={(value) => {
                    setRulesYamlContent(value || '')
                    setError(null)
                  }}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 sm:gap-2 pt-1 shrink-0 flex items-center justify-between sm:justify-between">
          <div className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
            {activeMode === 'visual' ? (
              <span>
                {rules.length} {t('rulesAndConfigEditor').toLowerCase()} • {customRulesCount} {t('customRulesTab').toLowerCase()}
                {deletedRulesCount > 0 ? ` • ${deletedRulesCount} ${t('delete').toLowerCase()}` : ''}
              </span>
            ) : (
              <span>{t('yamlModeSummary')}</span>
            )}
          </div>

          {/* Right action buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="glow"
              size="sm"
              onClick={handleSave}
              disabled={loading || saving}
              className="gap-1.5"
            >
              {saving ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  <span>{t('saving')}</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  <span>{t('saveAndApply')}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
