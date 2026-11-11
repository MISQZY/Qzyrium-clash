import { Tooltip } from 'radix-ui'
import { Trash2, Undo2, ChevronDown, ChevronUp, GripVertical, HelpCircle } from 'lucide-react'

import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

import { cn } from '../../lib/utils'
import type { RuleEditorState } from '../../hooks/useRuleEditor'
import { useTranslations } from '../../i18n'
import type { RuleItem } from '@shared/rule-editor'

export interface RuleListRowProps {
  editor: Pick<RuleEditorState, 'rules' | 'searchQuery' | 'draggedIndex' | 'handleToggleDelete' | 'handleMoveRule' | 'handleDragStart' | 'handleDragOver' | 'handleDragEnd' | 'startInlineEdit'>
  rule: RuleItem
  idx: number
}

export function RuleListRow({ editor, rule, idx }: RuleListRowProps) {
  const t = useTranslations('profiles')
  const { rules, searchQuery, draggedIndex, handleToggleDelete, handleMoveRule, handleDragStart, handleDragOver, handleDragEnd, startInlineEdit } = editor
  const isDeleted = rule.isDeleted === true
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
}
