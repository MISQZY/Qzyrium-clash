import { isLogicalRuleType, ruleTypes, isRuleSupportsNoResolve, isRuleSupportsSrc } from '@shared/rule-editor'

import { LoaderCircle, X } from 'lucide-react'

import { Button } from '../ui/button'

import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { cn } from '../../lib/utils'
import type { RuleEditorState } from '../../hooks/useRuleEditor'
import { useTranslations } from '../../i18n'
import type { RuleItem } from '@shared/rule-editor'

export interface RuleEditRowProps {
  editor: Pick<RuleEditorState, 'proxyGroups' | 'setEditingDraft' | 'validatingRule' | 'cancelInlineEdit' | 'saveInlineEdit'>
  rule: RuleItem
  editingDraft: NonNullable<RuleEditorState['editingDraft']>
}

export function RuleEditRow({ editor, rule, editingDraft }: RuleEditRowProps) {
  const t = useTranslations('profiles')
  const common = useTranslations('common')
  const { proxyGroups, setEditingDraft, validatingRule, cancelInlineEdit, saveInlineEdit } = editor
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
