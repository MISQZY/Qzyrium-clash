import React, { lazy, Suspense, useEffect, useState, useCallback, useRef, useMemo, startTransition } from 'react'
import yaml from 'yaml'
import { toCustomRules, createRuleId, isLogicalRuleType, getLogicalRuleClauses, formatLogicalRuleClause, ruleTypes, isRuleSupportsNoResolve, isRuleSupportsSrc, getRuleExample, builtinProxyTargets, type RuleItem, type RuleDraft } from '@shared/rule-editor'
import { serializeRulesToYaml, parseYamlToVisualRules } from '@shared/rule-editor-yaml'
import { loadRuleEditorSession } from '@shared/rule-editor-session'
import { validateRulePayload } from '@shared/rule-validation'
import { Tooltip } from 'radix-ui'
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
import type { ProfileItem } from '@shared/profile'
import { useLocale, useTranslations, useCustomLocalization } from '../i18n'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '../lib/utils'
import { useIsDarkTheme } from '../lib/theme'

const YamlEditor = lazy(() => import('./YamlEditor'))

interface ProfileEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileItem | null
  onSaved: () => void
}

export const ProfileEditorDialog: React.FC<ProfileEditorDialogProps> = ({
  open,
  onOpenChange,
  profile,
  onSaved
}) => {
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
      <DialogContent className="w-[96vw] max-w-6xl h-[92dvh] flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
        {/* Header */}
        <DialogHeader className="pb-2 border-b border-border/60 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <CodeXml className="size-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm font-semibold truncate">
                    <EmojiText text={profileName(profile, locale, customLocalization)} />
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
                  <Select
                    value={newRule.type}
                    onValueChange={(sel) => {
                      let extra = [...(newRule.additionalParams || [])]
                      if (!isRuleSupportsNoResolve(sel)) extra = extra.filter((p) => p !== 'no-resolve')
                      if (!isRuleSupportsSrc(sel)) extra = extra.filter((p) => p !== 'src')
                      setNewRule({ ...newRule, type: sel, additionalParams: extra })
                    }}
                  >
                    <SelectTrigger aria-label={t('ruleType')} className="w-full min-w-0 font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ruleTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select
                    value={newRule.proxy}
                    onValueChange={(proxy) => setNewRule({ ...newRule, proxy })}
                  >
                    <SelectTrigger aria-label={t('proxyTarget')} className="w-full min-w-0 font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {proxyGroups.map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional Options (Switches) */}
                {(isRuleSupportsNoResolve(newRule.type) || isRuleSupportsSrc(newRule.type)) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 border-t border-border/50">
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
                  <div className="mt-2 text-[11px] text-muted-foreground space-y-1.5 leading-relaxed pt-2 border-t border-border/40">
                    <p>• {t('instructions1')}</p>
                    <p>• {t('instructions2')}</p>
                    <p>• {t('instructions3')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Current Rules List */}
            <div className="flex-1 min-w-0 border-t md:border-t-0 md:border-l border-border/60 md:pl-4 pt-3 md:pt-0 flex flex-col min-h-0">
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
                      className="text-[10px] font-mono px-1.5 py-0 text-success border-success/40 bg-success/10"
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
                        <fieldset
                          disabled={validatingRule}
                          key={rule.id}
                          className="p-3 rounded-lg border-2 border-primary/60 bg-primary/5 flex flex-col gap-2.5 shadow-xs min-w-0"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr_140px] gap-2 items-start min-w-0">
                            {/* Type */}
                            <Select
                              value={editingDraft.type}
                              onValueChange={(sel) => {
                                let extra = [...(editingDraft.additionalParams || [])]
                                if (!isRuleSupportsNoResolve(sel)) extra = extra.filter((p) => p !== 'no-resolve')
                                if (!isRuleSupportsSrc(sel)) extra = extra.filter((p) => p !== 'src')
                                setEditingDraft({ ...editingDraft, type: sel, additionalParams: extra })
                              }}
                              disabled={validatingRule}
                            >
                              <SelectTrigger aria-label={t('ruleType')} className="w-full min-w-0 font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {!ruleTypes.includes(editingDraft.type) && <SelectItem value={editingDraft.type}>{editingDraft.type}</SelectItem>}
                                {ruleTypes.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

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
                            <Select
                              value={editingDraft.proxy}
                              onValueChange={(proxy) => setEditingDraft({ ...editingDraft, proxy })}
                              disabled={validatingRule}
                            >
                              <SelectTrigger aria-label={t('proxyTarget')} className="w-full min-w-0 font-mono"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {!proxyGroups.includes(editingDraft.proxy) && <SelectItem value={editingDraft.proxy}>{editingDraft.proxy}</SelectItem>}
                                {proxyGroups.map((g) => (
                                  <SelectItem key={g} value={g}>
                                    {g}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Options & Action buttons */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40">
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
                                <LoaderCircle className={cn("size-3.5", validatingRule ? "animate-spin" : "hidden")} />
                                <span>{validatingRule ? t('saving') : common('save')}</span>
                              </Button>
                            </div>
                          </div>
                        </fieldset>
                      )
                    }

                    // Normal Item Card
                    return (
                      <div
                        key={rule.id}
                        draggable={!searchQuery && !isDeleted}
                        onDragStart={() => handleDragStart(rules.indexOf(rule))}
                        onDragOver={(e) => handleDragOver(e, rules.indexOf(rule))}
                        onDragEnd={handleDragEnd}
                        onClick={() => !isDeleted && startInlineEdit(rule)}
                        className={cn(
                          'group flex h-12 items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer min-w-0',
                          (rule.validationError || rule.enabled === false) && 'grayscale opacity-60 text-muted-foreground',
                          isDeleted && 'bg-destructive/10 opacity-60 border-destructive/20 cursor-not-allowed',
                          (rule.validationError || rule.enabled === false) && 'bg-muted/50 border-border',
                          !isDeleted && !rule.validationError && rule.enabled !== false &&
                            rule.isCustom &&
                            'bg-success/8 border-success/25 hover:border-success/50 hover:bg-success/12',
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
                              onClick={() => handleMoveRule(rules.indexOf(rule), 'up')}
                              disabled={idx === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronUp className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveRule(rules.indexOf(rule), 'down')}
                              disabled={idx === rules.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
                            >
                              <ChevronDown className="size-3" />
                            </button>
                          </div>
                        )}

                        {/* Type badge + parameters */}
                        <div className="flex items-center gap-1 shrink-0 max-w-[140px] overflow-hidden" title={[rule.type, ...(rule.additionalParams ?? [])].join(', ')}>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-[10px] font-mono font-medium px-1.5 py-0.5',
                              rule.isCustom && !rule.validationError && rule.enabled !== false && 'bg-success/15 text-success border-transparent'
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
                        <div className="flex flex-1 items-center gap-1.5 min-w-0">
                          <p
                            className={cn(
                              'text-xs font-mono font-medium truncate leading-relaxed',
                              isDeleted && 'line-through text-muted-foreground'
                            )}
                            title={rule.payload || (rule.type === 'MATCH' ? rule.proxy : '')}
                          >
                            {rule.type === 'MATCH' ? rule.proxy : rule.payload || '*'}
                          </p>
                          {rule.validationError && (
                            <Tooltip.Provider delayDuration={150}>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex shrink-0 items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors cursor-help rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    aria-label={t('ruleValidationError')}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <HelpCircle className="size-3 shrink-0" />
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content side="top" sideOffset={6} className="sidebar-tooltip max-w-80 break-words">
                                    <p className="text-[11px] leading-snug">{t('ruleValidationError')}</p>
                                    <p className="mt-1 text-[11px] leading-snug font-mono">{rule.validationError}</p>
                                    <Tooltip.Arrow className="fill-popover" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          )}
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
                              isDeleted ? 'text-success hover:text-success' : 'text-destructive hover:text-destructive/80'
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

          {/* Import and mount CodeMirror only after the YAML mode is selected. */}
          {activeMode === 'yaml' && (
            <div className="relative flex-1 min-h-0 w-full rounded-lg border border-border/70 overflow-hidden bg-background flex flex-col">
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
        <DialogFooter className="gap-2 sm:gap-2 pt-1 border-t border-border/40 shrink-0 flex items-center justify-between sm:justify-between">
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
              disabled={loading || saving || validatingRule || loadedProfileId !== profile.id}
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
