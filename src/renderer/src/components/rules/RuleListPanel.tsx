import { ListTree, Search, X } from 'lucide-react'

import { Badge } from '../ui/badge'
import { Input } from '../ui/input'

import type { RuleEditorState } from '../../hooks/useRuleEditor'
import { useTranslations } from '../../i18n'
import { RuleEditRow, type RuleEditRowProps } from './RuleEditRow'
import { RuleListRow, type RuleListRowProps } from './RuleListRow'

export interface RuleListPanelProps {
  editor: Pick<RuleEditorState, 'rules' | 'searchQuery' | 'setSearchQuery' | 'editingId' | 'editingDraft' | 'filteredRules' | 'customRulesCount' | 'deletedRulesCount'> & RuleEditRowProps['editor'] & RuleListRowProps['editor']

}

export function RuleListPanel({ editor }: RuleListPanelProps) {
  const t = useTranslations('profiles')
  const { rules, searchQuery, setSearchQuery, editingId, editingDraft, filteredRules, customRulesCount, deletedRulesCount } = editor

  return (
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

                    if (isEditing && editingDraft) {
                      // Inline Editing Mode

                      return (
                        <RuleEditRow key={rule.id} rule={rule} editingDraft={editingDraft} editor={editor} />
                      )
                    }

                    // Normal Item Card
                    return (
                      <RuleListRow key={rule.id} rule={rule} idx={idx} editor={editor} />
                    )
                  })
                )}
              </div>
            </div>
  )
}
