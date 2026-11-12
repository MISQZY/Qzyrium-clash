import { CodeXml, Code, ListTree } from 'lucide-react'
import { EmojiText } from '../EmojiText'
import { profileName } from '../../lib/profile-name'
import { DialogHeader, DialogTitle } from '../ui/dialog'

import { Badge } from '../ui/badge'

import { cn } from '../../lib/utils'
import type { RuleEditorState } from '../../hooks/useRuleEditor'
import { useTranslations } from '../../i18n'
import type { ProfileItem } from '@shared/profile'

export interface RuleEditorHeaderProps {
  editor: Pick<RuleEditorState, 'locale' | 'customLocalization' | 'activeMode' | 'handleModeChange'>
  profile: ProfileItem
}

export function RuleEditorHeader({ editor, profile }: RuleEditorHeaderProps) {
  const t = useTranslations('profiles')
  const { locale, customLocalization, activeMode, handleModeChange } = editor

  return (
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
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer',
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
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer',
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
  )
}
