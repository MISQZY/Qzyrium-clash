import { useMemo, useState } from 'react'
import { createRuleId, isLogicalRuleType, getLogicalRuleClauses, formatLogicalRuleClause, type RuleDraft, type RuleItem } from '@shared/rule-editor'
import { validateRulePayload } from '@shared/rule-validation'

/** Keep typing and validation local to the creation panel. */
export function useRuleDraft(onAddRule: (rule: RuleItem) => void) {
  // New rule draft (left column)
  const [newRule, setNewRule] = useState<RuleDraft>({
    type: 'DOMAIN-SUFFIX',
    payload: '',
    proxy: 'DIRECT',
    additionalParams: []
  })

  const [instructionsOpen, setInstructionsOpen] = useState(false)

  // Validate payload
  const isNewPayloadValid = useMemo(() => {
    if (newRule.type === 'MATCH' || !newRule.payload) return true
    return validateRulePayload(newRule.type, newRule.payload)
  }, [newRule.type, newRule.payload])

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

    onAddRule(newItem)
    setNewRule((prev) => ({ ...prev, payload: '' }))
  }

  return { newRule, setNewRule, instructionsOpen, setInstructionsOpen, isNewPayloadValid, isNewRuleLogical, newRuleLogicalSummary, handleAddRule }
}
