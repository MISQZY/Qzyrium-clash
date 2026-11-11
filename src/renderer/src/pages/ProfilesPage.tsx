import { AddProfileDialog } from '../components/profiles/AddProfileDialog'
import { useProfileImport } from '../hooks/useProfileImport'
import { ProfileCard } from '../components/profiles/ProfileCard'
import { useLocale, useTranslations, useCustomLocalization } from '../i18n'
import React, { lazy, Suspense, useRef, useState } from 'react'
import { Plus, Globe } from 'lucide-react'

import { ProfileItem } from '@shared/profile'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog'
import { profileName as displayName } from '../lib/profile-name'

const ProfileEditorDialog = lazy(() => import('../components/ProfileEditorDialog').then((module) => ({ default: module.ProfileEditorDialog })))
const ProfileFileEditorDialog = lazy(() => import('../components/ProfileFileEditorDialog').then((module) => ({ default: module.ProfileFileEditorDialog })))
const ProfileInfoDialog = lazy(() => import('../components/ProfileInfoDialog').then((module) => ({ default: module.ProfileInfoDialog })))

interface ProfilesPageProps {
  profiles: ProfileItem[]
  activeProfile: ProfileItem | null
  onSwitchProfile: (id: string) => void
  onRefreshAll: () => void
  importRequest?: { url: string; name?: string } | null
  onClearImportRequest?: () => void
}

export const ProfilesPage: React.FC<ProfilesPageProps> = ({
  profiles,
  activeProfile,
  onSwitchProfile,
  onRefreshAll,
  importRequest,
  onClearImportRequest
}) => {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const customLocalization = useCustomLocalization()

  const [editingProfile, setEditingProfile] = useState<ProfileItem | null>(null)
  const [editingFileProfile, setEditingFileProfile] = useState<ProfileItem | null>(null)
  const [editingInfoProfile, setEditingInfoProfile] = useState<ProfileItem | null>(null)
  const [error, setError] = useState('')
  const importDraft = useProfileImport({ importRequest, onClearImportRequest, onRefreshAll, error, setError })
  const { showAddModal, setShowAddModal } = importDraft
  const pendingUpdates = useRef(new Set<string>())
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [profileToDelete, setProfileToDelete] = useState<ProfileItem | null>(null)

  const confirmDelete = async () => {
    if (!window.api || !profileToDelete) return
    const id = profileToDelete.id
    setProfileToDelete(null)
    setError('')
    try {
      await window.api.profiles.delete(id)
      onRefreshAll()
    } catch (err) {
      setError(t('deleteFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  const handleUpdate = async (id: string) => {
    if (!window.api || pendingUpdates.current.has(id)) return
    pendingUpdates.current.add(id)
    setUpdating(new Set(pendingUpdates.current))
    setError('')
    try {
      await window.api.profiles.update(id)
      onRefreshAll()
    } catch (err) {
      setError(t('updateFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      pendingUpdates.current.delete(id)
      setUpdating(new Set(pendingUpdates.current))
    }
  }

  return (
    <div className="page-scroll">
      {/* Header */}
      <div className="page-heading">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('profiles')}</h1>
        </div>

        <Button
          onClick={() => setShowAddModal(true)}
          variant="glow"
          size="sm"
          className="gap-2"
        >
          <Plus className="size-3.5" />
          <span>{t('addSubscription')}</span>
        </Button>
      </div>

      {/* Profile List */}
      {error && !showAddModal && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-col gap-3">
        {profiles.length > 0 ? (
          profiles.map(profile => (
            <ProfileCard key={profile.id} profile={profile} isActive={activeProfile?.id === profile.id}
              updating={updating.has(profile.id)} onSwitchProfile={onSwitchProfile} onUpdate={handleUpdate}
              onEditInfo={setEditingInfoProfile} onEditFile={setEditingFileProfile}
              onDelete={setProfileToDelete} onEditRules={setEditingProfile} />
          ))
        ) : (
          <Card className="p-12 text-center flex flex-col items-center justify-center">
            <Globe className="size-8 text-muted-foreground/40 mb-2" />
            <span className="text-sm font-medium text-foreground">{t('noSubscriptionsLoaded')}</span>
            <span className="text-xs text-muted-foreground mt-1">
              {t('clickAddSubscriptionToImportYourClashMihomoProviderURLOrLocalYAML')}
            </span>
          </Card>
        )}
      </div>

      {/* Add Subscription Dialog */}
      <AddProfileDialog draft={importDraft} />

      {editingProfile && (
        <Suspense fallback={null}>
          <ProfileEditorDialog
            open
            onOpenChange={(open) => !open && setEditingProfile(null)}
            profile={editingProfile}
            onSaved={onRefreshAll}
          />
        </Suspense>
      )}

      {editingFileProfile && (
        <Suspense fallback={null}>
          <ProfileFileEditorDialog
            open
            onOpenChange={(open) => !open && setEditingFileProfile(null)}
            profile={editingFileProfile}
            onSaved={onRefreshAll}
          />
        </Suspense>
      )}

      {editingInfoProfile && (
        <Suspense fallback={null}>
          <ProfileInfoDialog
            open
            onOpenChange={(open) => !open && setEditingInfoProfile(null)}
            profile={editingInfoProfile}
            onSaved={onRefreshAll}
          />
        </Suspense>
      )}

      <AlertDialog open={!!profileToDelete} onOpenChange={(open) => !open && setProfileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('areYouSureYouWantToDeleteThisProfile')}</AlertDialogTitle>
            <AlertDialogDescription>
              {profileToDelete ? displayName(profileToDelete, locale, customLocalization) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
