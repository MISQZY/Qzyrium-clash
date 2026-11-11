import { RuleListPanel } from './rules/RuleListPanel'
import { RuleCreatePanel } from './rules/RuleCreatePanel'
import { useRuleEditor, type RuleEditorProps } from '../hooks/useRuleEditor'
import React, { lazy, Suspense } from 'react'

import { CodeXml, Check, AlertCircle, LoaderCircle, Code, ListTree } from 'lucide-react'

import { EmojiText } from './EmojiText'
import { profileName } from '../lib/profile-name'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

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
  const { t, locale, customLocalization, activeMode, rules, validatingRule, rulesYamlContent, setRulesYamlContent, loading, loadedProfileId, saving, error, setError, isDark, handleModeChange, handleSave, customRulesCount, deletedRulesCount } = editor

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
            <RuleListPanel editor={editor} />
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
