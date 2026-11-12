import { CodeXml, Code, ListTree } from 'lucide-react'
import { ProfileEditorHeader } from '../ProfileEditorHeader'

import { cn } from '../../lib/utils'
import type { RuleEditorState } from '../../hooks/useRuleEditor'
import { useTranslations } from '../../i18n'
import type { ProfileItem } from '@shared/profile'

export interface RuleEditorHeaderProps {
  editor: Pick<RuleEditorState, 'activeMode' | 'handleModeChange'>
  profile: ProfileItem
}

export function RuleEditorHeader({ editor, profile }: RuleEditorHeaderProps) {
  const t = useTranslations('profiles')
  const { activeMode, handleModeChange } = editor

  return (
    <ProfileEditorHeader profile={profile} icon={CodeXml} description={t('rulesAndConfigEditor')}>
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
    </ProfileEditorHeader>
  )
}
