import type { CustomRuleItem } from './profile'
import { parseProfileConfig } from './profile-config'
import { collectProxyGroups, mergeRuleOverrides, parseRuleStringToItem } from './rule-editor'

export async function loadRuleEditorSession(api: {
  getCustomRules(id: string): Promise<CustomRuleItem[]>
  getRawConfig(id: string): Promise<string | null>
}, id: string) {
  const [overrides, content] = await Promise.all([api.getCustomRules(id), api.getRawConfig(id)])
  if (content === null) throw new Error('Profile file is missing')
  const config = parseProfileConfig(content)
  const occurrences = new Map<string, number>()
  const base = (Array.isArray(config.rules) ? config.rules : [])
    .filter((rule): rule is string => typeof rule === 'string' && !!rule.trim())
    .map((text, sourceIndex) => {
      const sourceRule = text.trim()
      const occurrence = occurrences.get(sourceRule) ?? 0
      occurrences.set(sourceRule, occurrence + 1)
      return { ...parseRuleStringToItem(sourceRule), sourceRule, sourceOccurrence: occurrence, sourceIndex }
    })
  return { rules: mergeRuleOverrides(base, overrides), groups: collectProxyGroups(config), baseCount: base.length }
}
