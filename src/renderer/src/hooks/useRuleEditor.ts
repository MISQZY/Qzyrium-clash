import type React from 'react'
import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react'
import yaml from 'yaml'
import type { ProfileItem } from '@shared/profile'
import { toCustomRules, createRuleId, isLogicalRuleType, getLogicalRuleClauses, formatLogicalRuleClause, getRuleExample, builtinProxyTargets, type RuleItem, type RuleDraft } from '@shared/rule-editor'
import { serializeRulesToYaml, parseYamlToVisualRules } from '@shared/rule-editor-yaml'
import { loadRuleEditorSession } from '@shared/rule-editor-session'
import { validateRulePayload } from '@shared/rule-validation'
import { useLocale, useTranslations, useCustomLocalization } from '../i18n'
import { useIsDarkTheme } from '../lib/theme'

export interface RuleEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileItem | null
  onSaved: () => void
}


export function useRuleEditor({ open, profile, onSaved, onOpenChange }: RuleEditorProps) {
  const t = useTranslations('profiles')
  const common = useTranslations('common')
  const locale = useLocale()
  const customLocalization = useCustomLocalization()

  // Navigation mode: 'visual' (Visual Rules) | 'yaml' (Rules YAML) | 'file' (Profile Raw Config YAML)
  const [activeMode, setActiveMode] = useState<'visual' | 'yaml'>('visual')

  // Rules state
  const [rules, setRules] = useState<RuleItem[]>([])
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
  const [validatingRule, setValidatingRule] = useState(false)
  const ruleValidationRequest = useRef(0)
  useEffect(() => {
    ruleValidationRequest.current++
    setValidatingRule(false)
  }, [open, profile?.id])

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // Instructions accordion
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  // Raw file editor & Diff mode switches
  const [rulesYamlContent, setRulesYamlContent] = useState('')
  const [isDiff, setIsDiff] = useState(false)

  // Loading & error state
  const [loading, setLoading] = useState(false)
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDark = useIsDarkTheme()

  const yamlMessages = useRef(t)
  yamlMessages.current = t
  const serializeRules = useCallback((rules: RuleItem[]) => serializeRulesToYaml(rules, yamlMessages.current), [])

  // Load profile data when dialog opens
  useEffect(() => {
    if (!open || !profile || !window.api) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setActiveMode('visual')

    setLoadedProfileId(null)
    loadRuleEditorSession(window.api.profiles, profile.id).then((session) => {
      if (cancelled) return
      setProxyGroups(session.groups)
      setRules(session.rules)
      setRulesYamlContent(serializeRules(session.rules))
      setLoadedProfileId(profile.id)
    }).catch((error) => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open, profile, serializeRules])

  // Switch modes and sync content
  const handleModeChange = (newMode: 'visual' | 'yaml') => {
    if (newMode === activeMode) return
    setError(null)

    if (activeMode === 'visual' && newMode === 'yaml') {
      setRulesYamlContent(serializeRules(rules))
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
      copy.splice(targetIndex, 0, item.sourceRule === undefined ? item : { ...item, isMoved: true })
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
      copy.splice(index, 0, dragged.sourceRule === undefined ? dragged : { ...dragged, isMoved: true })
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

  const saveInlineEdit = async () => {
    if (!editingDraft || !profile || !window.api || validatingRule) return
    if (editingDraft.type !== 'MATCH' && editingDraft.payload.trim() && !validateRulePayload(editingDraft.type, editingDraft.payload)) {
      setError(`${t('invalidPayload')}: ${getRuleExample(editingDraft.type)}`)
      return
    }
    const request = ++ruleValidationRequest.current
    const draft = { ...editingDraft, payload: editingDraft.payload.trim() }
    setValidatingRule(true)
    setError(null)
    try {
      const candidates = toCustomRules(rules.filter((rule) => rule.id !== draft.id))
      // Validate the draft even when it was manually disabled, without enabling it.
      candidates.unshift({ ...draft, sourceRule: undefined, sourceOccurrence: undefined, enabled: true, isDeleted: false })
      const checked = await window.api.profiles.validateCustomRules(profile.id, candidates)
      if (request !== ruleValidationRequest.current) return
      const result = checked.find((rule) => rule.id === draft.id)
      if (!result) throw new Error('Rule validation returned no result')
      setRules((prev) => prev.map((rule) => rule.id === draft.id
        ? { ...draft, validationError: result.validationError }
        : rule))
      setEditingId(null)
      setEditingDraft(null)
    } catch (err) {
      if (request === ruleValidationRequest.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (request === ruleValidationRequest.current) setValidatingRule(false)
    }
  }

  // Save changes to backend
  const handleSave = useCallback(async () => {
    if (!profile || !window.api || saving || loading || loadedProfileId !== profile.id) return

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
      const customItems = toCustomRules(rulesToSave)

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
    loading,
    loadedProfileId,
    activeMode,
    rules,
    rulesYamlContent,
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


  return { t, common, locale, customLocalization, activeMode, rules, proxyGroups, searchQuery, setSearchQuery, newRule, setNewRule, editingId, editingDraft, setEditingDraft, validatingRule, draggedIndex, instructionsOpen, setInstructionsOpen, rulesYamlContent, setRulesYamlContent, loading, loadedProfileId, saving, error, setError, isDark, handleModeChange, isNewPayloadValid, isNewRuleLogical, newRuleLogicalSummary, handleAddRule, handleToggleDelete, handleMoveRule, handleDragStart, handleDragOver, handleDragEnd, startInlineEdit, cancelInlineEdit, saveInlineEdit, handleSave, filteredRules, customRulesCount, deletedRulesCount }
}
