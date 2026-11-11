import { Check, LoaderCircle } from 'lucide-react'

import { DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'

import type { RuleEditorState } from '../../hooks/useRuleEditor'
import { useTranslations } from '../../i18n'

export interface RuleEditorFooterProps {
  editor: Pick<RuleEditorState, 'activeMode' | 'rules' | 'validatingRule' | 'loading' | 'loadedProfileId' | 'saving' | 'handleSave' | 'customRulesCount' | 'deletedRulesCount'>
  profileId: string
  onOpenChange: (open: boolean) => void
}

export function RuleEditorFooter({ editor, profileId, onOpenChange }: RuleEditorFooterProps) {
  const t = useTranslations('profiles')
  const { activeMode, rules, validatingRule, loading, loadedProfileId, saving, handleSave, customRulesCount, deletedRulesCount } = editor

  return (
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
              disabled={loading || saving || validatingRule || loadedProfileId !== profileId}
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
  )
}
