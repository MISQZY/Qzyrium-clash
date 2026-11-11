import { useLocale, useTranslations, useCustomLocalization } from '../../i18n'

import { ProfileItem } from '@shared/profile'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { profileName as displayName } from '../../lib/profile-name'

export function DeleteProfileDialog({ profile, onCancel, onConfirm }: {
  profile: ProfileItem | null; onCancel: () => void; onConfirm: () => void
}) {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const customLocalization = useCustomLocalization()
  return (
    <AlertDialog open={!!profile} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('areYouSureYouWantToDeleteThisProfile')}</AlertDialogTitle>
          <AlertDialogDescription>
            {profile ? displayName(profile, locale, customLocalization) : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
