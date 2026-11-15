import React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { yamlEditorBasicSetup } from '../lib/yaml-editor-extensions'
import { CodeMirrorDiffEditor } from './CodeMirrorDiffEditor'
import { FileCode, AlertCircle, LoaderCircle } from 'lucide-react'
import type { ProfileItem } from '@shared/profile'
import { ProfileEditorHeader } from './ProfileEditorHeader'
import { Dialog, DialogContent } from './ui/dialog'
import { useProfileFileEditor } from '../hooks/useProfileFileEditor'
import { ProfileFileEditorFooter } from './profiles/ProfileFileEditorFooter'

interface ProfileFileEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileItem | null
  onSaved: () => void
}

export const ProfileFileEditorDialog: React.FC<ProfileFileEditorDialogProps> = ({
  open,
  onOpenChange,
  profile,
  onSaved
}) => {
  const {
    originalContent,
    contentRef,
    isDiff,
    setIsDiff,
    sideBySide,
    setSideBySide,
    loading,
    saving,
    error,
    setError,
    editorRef,
    containerRef,
    cmRef,
    isDark,
    extensions,
    handleCreateEditor,
    handleSave,
    t
  } = useProfileFileEditor({ open, onOpenChange, profile, onSaved })

  if (!profile) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[92dvh] flex flex-col p-4 sm:p-5 gap-3 overflow-hidden">
        {/* Header */}
        <ProfileEditorHeader profile={profile} icon={FileCode} description={t('editProfileFile')} />

        {/* Error notification */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md shrink-0">
            <AlertCircle className="size-4 shrink-0" />
            <span className="font-mono truncate">{error}</span>
          </div>
        )}

        {/* Editor Container */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 w-full rounded-lg border border-border/70 overflow-hidden bg-background flex flex-col"
        >
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
              <LoaderCircle className="size-7 animate-spin text-primary" />
            </div>
          ) : isDiff ? (
            <CodeMirrorDiffEditor
              original={originalContent}
              modified={contentRef.current}
              sideBySide={sideBySide}
              isDark={isDark}
              onChange={(val) => {
                contentRef.current = val
                if (error) setError(null)
              }}
              onMount={(handle) => {
                editorRef.current = handle
              }}
            />
          ) : (
            <div className="monaco-editor cm-editor-wrapper h-full w-full flex-1 min-h-0 relative">
              <textarea tabIndex={-1} aria-hidden="true" className="sr-only opacity-0 pointer-events-none absolute size-0" readOnly />
              <CodeMirror
                ref={cmRef}
                value={contentRef.current}
                height="100%"
                theme="none"
                className="h-full w-full flex-1 min-h-0"
                extensions={extensions}
                onCreateEditor={handleCreateEditor}
                onChange={(value) => {
                  contentRef.current = value || ''
                  if (error) setError(null)
                }}
                basicSetup={yamlEditorBasicSetup}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <ProfileFileEditorFooter
          isDiff={isDiff}
          onIsDiffChange={setIsDiff}
          sideBySide={sideBySide}
          onSideBySideChange={setSideBySide}
          saving={saving}
          loading={loading}
          onCancel={() => onOpenChange(false)}
          onSave={handleSave}
        />
      </DialogContent>
    </Dialog>
  )
}

export default ProfileFileEditorDialog
