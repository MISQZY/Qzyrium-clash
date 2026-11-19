import React from 'react'
import { DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { SaveButton } from '../ui/SaveButton'
import { FileEditorComparisonControls } from '../FileEditor'
import { useTranslations } from '../../i18n'

interface ProfileFileEditorFooterProps {
  isDiff: boolean
  onIsDiffChange: (checked: boolean) => void
  sideBySide: boolean
  onSideBySideChange: (checked: boolean) => void
  saving: boolean
  loading: boolean
  onCancel: () => void
  onSave: () => void
}

export const ProfileFileEditorFooter: React.FC<ProfileFileEditorFooterProps> = ({
  isDiff,
  onIsDiffChange,
  sideBySide,
  onSideBySideChange,
  saving,
  loading,
  onCancel,
  onSave
}) => {
  const t = useTranslations('profiles')
  return (
    <DialogFooter className="gap-2 sm:gap-2 pt-1 border-t border-border/40 shrink-0 flex flex-wrap items-center justify-between sm:justify-between">
      <FileEditorComparisonControls isDiff={isDiff} onIsDiffChange={onIsDiffChange}
        sideBySide={sideBySide} onSideBySideChange={onSideBySideChange} disabled={loading || saving} />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          {t('cancel')}
        </Button>
        <SaveButton
          saving={saving}
          label={t('saveAndApply')}
          savingLabel={t('saving')}
          onClick={onSave}
          disabled={loading}
        />
      </div>
    </DialogFooter>
  )
}
