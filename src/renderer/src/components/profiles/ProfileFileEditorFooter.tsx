import React from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
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
    <DialogFooter className="gap-2 sm:gap-2 pt-1 border-t border-border/40 shrink-0 flex items-center justify-between sm:justify-between">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <Switch
            checked={isDiff}
            onCheckedChange={(checked) => {
              onIsDiffChange(checked)
              if (!checked) onSideBySideChange(false)
            }}
          />
          <span>{t('showChanges')}</span>
        </label>
        {isDiff && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch checked={sideBySide} onCheckedChange={onSideBySideChange} />
            <span>{t('sideBySide')}</span>
          </label>
        )}
      </div>

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
        <Button
          type="button"
          variant="glow"
          size="sm"
          onClick={onSave}
          disabled={loading || saving}
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
