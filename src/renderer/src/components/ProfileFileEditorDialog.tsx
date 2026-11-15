import React from 'react'
import { FileEditorContent, FileEditorDialogContent } from './FileEditor'
import { FileCode, AlertCircle } from 'lucide-react'
import type { ProfileItem } from '@shared/profile'
import { ProfileEditorHeader } from './ProfileEditorHeader'
import { Dialog } from './ui/dialog'
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
    isDark,
    handleCreateEditor,
    handleSave,
    t
  } = useProfileFileEditor({ open, onOpenChange, profile, onSaved })

  if (!profile) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FileEditorDialogContent>
        {/* Header */}
        <ProfileEditorHeader profile={profile} icon={FileCode} description={t('editProfileFile')} />

        {/* Error notification */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md shrink-0">
            <AlertCircle className="size-4 shrink-0" />
            <span className="font-mono truncate">{error}</span>
          </div>
        )}

        <FileEditorContent
          containerRef={containerRef}
          original={originalContent}
          value={contentRef.current}
          isDiff={isDiff}
          sideBySide={sideBySide}
          loading={loading}
          isDark={isDark}
          onCreateEditor={handleCreateEditor}
          onChange={value => {
            contentRef.current = value
            if (error) setError(null)
          }}
          onMount={handle => { editorRef.current = handle }}
        />

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
      </FileEditorDialogContent>
    </Dialog>
  )
}

export default ProfileFileEditorDialog
