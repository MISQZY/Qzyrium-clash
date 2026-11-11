import { RuleEditorHeader } from './rules/RuleEditorHeader'
import { RuleEditorFooter } from './rules/RuleEditorFooter'
import { RuleYamlPanel } from './rules/RuleYamlPanel'
import { RuleListPanel } from './rules/RuleListPanel'
import { RuleCreatePanel } from './rules/RuleCreatePanel'
import { useRuleEditor, type RuleEditorProps } from '../hooks/useRuleEditor'
import React from 'react'

import { AlertCircle, LoaderCircle } from 'lucide-react'

import { Dialog, DialogContent } from './ui/dialog'

import { cn } from '../lib/utils'

type ProfileEditorDialogProps = RuleEditorProps

export const ProfileEditorDialog: React.FC<ProfileEditorDialogProps> = ({
  open,
  onOpenChange,
  profile,
  onSaved
}) => {
  const editor = useRuleEditor({ open, profile, onSaved, onOpenChange })
  const { activeMode, loading, error } = editor

  if (!profile) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[92dvh] flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
        {/* Header */}
        <RuleEditorHeader profile={profile} editor={editor} />

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
            <RuleYamlPanel editor={editor} />
          )}
        </div>

        {/* Footer */}
        <RuleEditorFooter profileId={profile.id} onOpenChange={onOpenChange} editor={editor} />
      </DialogContent>
    </Dialog>
  )
}
