import { RuleCreatePanel } from './rules/RuleCreatePanel'
import { useRuleEditor, type RuleEditorProps } from '../hooks/useRuleEditor'
import React, { lazy, Suspense } from 'react'

import { isLogicalRuleType, ruleTypes, isRuleSupportsNoResolve, isRuleSupportsSrc } from '@shared/rule-editor'

import { Tooltip } from 'radix-ui'
import { CodeXml, Check, AlertCircle, LoaderCircle, Code, ListTree, Trash2, Undo2, Search, ChevronDown, ChevronUp, GripVertical, HelpCircle, X } from 'lucide-react'

import { EmojiText } from './EmojiText'
import { profileName } from '../lib/profile-name'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Switch } from './ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { cn } from '../lib/utils'

const YamlEditor = lazy(() => import('./YamlEditor'))

type ProfileEditorDialogProps = RuleEditorProps

export const ProfileEditorDialog: React.FC<ProfileEditorDialogProps> = ({
  open,
  onOpenChange,
  profile,
  onSaved
}) => {
  const editor = useRuleEditor({ open, profile, onSaved, onOpenChange })
  const { t, common, locale, customLocalization, activeMode, rules, proxyGroups, searchQuery, setSearchQuery, editingId, editingDraft, setEditingDraft, validatingRule, draggedIndex, rulesYamlContent, setRulesYamlContent, loading, loadedProfileId, saving, error, setError, isDark, handleModeChange, handleToggleDelete, handleMoveRule, handleDragStart, handleDragOver, handleDragEnd, startInlineEdit, cancelInlineEdit, saveInlineEdit, handleSave, filteredRules, customRulesCount, deletedRulesCount } = editor

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
            <RuleCreatePanel editor={editor} />

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
