import yaml from 'yaml'
import type { CustomRuleItem } from './profile'
import { toCustomRules, mergeRuleOverrides, parseRuleStringToItem, convertRuleToString, type RuleItem } from './rule-editor'

type YamlCommentKey = 'yamlRulesComment' | 'yamlPrependComment' | 'yamlAppendComment' | 'yamlDeleteComment' | 'yamlExamplesComment'

export function serializeRulesToYaml(ruleList: RuleItem[], messages: (key: YamlCommentKey) => string): string {
    type Entry = string | { rule: string; sourceOccurrence: number; sourceRule?: string }
    const prepend: Entry[] = []
    const append: Entry[] = []
    const deleted: Entry[] = []
    const inactive: { rule: string; position: 'top' | 'bottom'; enabled?: boolean; validationError?: string; sourceOccurrence?: number; sourceRule?: string }[] = []

    for (const rule of toCustomRules(ruleList)) {
      const value = convertRuleToString(rule)
      const indexed = rule.offset === undefined ? value : `${rule.offset},${value}`
      const entry: Entry = rule.sourceRule === undefined ? indexed : {
        rule: indexed, sourceOccurrence: rule.sourceOccurrence ?? 0,
        ...(rule.replacementRule ? { sourceRule: rule.sourceRule } : {})
      }
      if (rule.isDeleted) {
        deleted.push(rule.sourceRule === undefined ? value : entry)
        continue
      }
      if (rule.enabled === false || rule.validationError) {
        inactive.push({ rule: indexed, position: rule.position || 'top', enabled: rule.enabled, validationError: rule.validationError,
          sourceOccurrence: rule.sourceRule === undefined ? undefined : rule.sourceOccurrence ?? 0,
          ...(rule.replacementRule ? { sourceRule: rule.sourceRule } : {}) })
      } else if (rule.position === 'bottom') append.push(entry)
      else prepend.push(entry)
    }

    const doc = [
      '# ' + messages('yamlRulesComment'),
      '# ' + messages('yamlPrependComment'),
      '# ' + messages('yamlAppendComment'),
      '# ' + messages('yamlDeleteComment'),
      ''
    ]

    const obj: Record<string, unknown> = {}
    if (inactive.length > 0) obj['disabled'] = inactive
    if (prepend.length > 0) obj['prepend'] = prepend
    if (append.length > 0) obj['append'] = append
    if (deleted.length > 0) obj['delete'] = deleted

    if (Object.keys(obj).length === 0) {
      doc.push('# ' + messages('yamlExamplesComment'))
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
  }

export function parseYamlToVisualRules(yamlStr: string, baseRuleList: RuleItem[]): RuleItem[] {
    const parsed = yaml.parse(yamlStr) as Record<string, unknown> | null
    const base = baseRuleList.map((rule) => ({
      ...rule,
      ...(rule.sourceRule === undefined ? {} : parseRuleStringToItem(rule.sourceRule)),
      id: rule.id,
      isMoved: false, isDeleted: false, offset: undefined, replacementRule: undefined,
      enabled: true, validationError: undefined
    }))
      .sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0))
    if (!parsed || typeof parsed !== 'object') return base
    const entries = (value: unknown): { rule: string; sourceRule?: string; sourceOccurrence?: number }[] => !Array.isArray(value) ? [] : value.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) return [{ rule: item }]
      if (item && typeof item === 'object' && typeof item.rule === 'string') return [{
        rule: item.rule,
        sourceRule: typeof item.sourceRule === 'string' ? item.sourceRule : undefined,
        sourceOccurrence: Number.isSafeInteger(item.sourceOccurrence) && item.sourceOccurrence >= 0 ? item.sourceOccurrence : undefined
      }]
      return []
    })
    const overrides: CustomRuleItem[] = []
    const add = (entry: { rule: string; sourceRule?: string; sourceOccurrence?: number }, position: 'top' | 'bottom', extra: Partial<CustomRuleItem> = {}) => {
      const rule = parseRuleStringToItem(entry.rule, true)
      const occurrence = Number.isSafeInteger(entry.sourceOccurrence) && entry.sourceOccurrence! >= 0 ? entry.sourceOccurrence : undefined
      // A source occurrence marks a subscription row; older YAML also included its full sourceRule.
      const sourceRule = typeof entry.sourceRule === 'string' ? entry.sourceRule : occurrence === undefined ? undefined :
        base.find((item) => item.sourceOccurrence === occurrence && convertRuleToString(item) === convertRuleToString(rule))?.sourceRule ?? convertRuleToString(rule)
      overrides.push({ ...rule, position, sourceRule, sourceOccurrence: occurrence,
        replacementRule: sourceRule !== undefined && convertRuleToString(rule) !== sourceRule ? convertRuleToString(rule) : undefined,
        ...extra })
    }
    const prepend = entries(parsed.prepend)
    const append = entries(parsed.append)
    for (const value of prepend.length || append.length ? prepend : entries(parsed.rules)) add(value, 'top')
    for (const value of append) add(value, 'bottom')
    if (Array.isArray(parsed.disabled)) for (const value of parsed.disabled) {
      if (value && typeof value === 'object' && typeof value.rule === 'string') add(value,
        value.position === 'bottom' ? 'bottom' : 'top', {
          enabled: value.enabled !== false,
          validationError: typeof value.validationError === 'string' ? value.validationError : undefined
        })
    }
    for (const value of entries(parsed.delete)) add(value, 'top', { isDeleted: true })
    return mergeRuleOverrides(base, overrides)
  }
