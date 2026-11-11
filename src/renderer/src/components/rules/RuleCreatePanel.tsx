import { ruleTypes, isRuleSupportsNoResolve, isRuleSupportsSrc, getRuleExample } from '@shared/rule-editor'

import { ArrowUpToLine, ArrowDownToLine, ChevronDown, HelpCircle } from 'lucide-react'

import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { cn } from '../../lib/utils'
import type { RuleEditorState } from '../../hooks/useRuleEditor'
import { useTranslations } from '../../i18n'

interface RuleCreatePanelProps {
  editor: Pick<RuleEditorState, 'proxyGroups' | 'newRule' | 'setNewRule' | 'instructionsOpen' | 'setInstructionsOpen' | 'isNewPayloadValid' | 'isNewRuleLogical' | 'newRuleLogicalSummary' | 'handleAddRule'>

}

export function RuleCreatePanel({ editor }: RuleCreatePanelProps) {
  const t = useTranslations('profiles')
  const { proxyGroups, newRule, setNewRule, instructionsOpen, setInstructionsOpen, isNewPayloadValid, isNewRuleLogical, newRuleLogicalSummary, handleAddRule } = editor

  return (
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
  )
}
