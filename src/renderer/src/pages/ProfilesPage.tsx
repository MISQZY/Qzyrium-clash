import { DeleteProfileDialog } from '../components/profiles/DeleteProfileDialog'
import { useProfileActions } from '../hooks/useProfileActions'
import { AddProfileDialog } from '../components/profiles/AddProfileDialog'
import { useProfileImport } from '../hooks/useProfileImport'
import { ProfileCard } from '../components/profiles/ProfileCard'
import { useTranslations } from '../i18n'
import React, { lazy, Suspense, useState } from 'react'
import { Plus, Globe } from 'lucide-react'

import { ProfileItem } from '@shared/profile'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'

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

  const [editingProfile, setEditingProfile] = useState<ProfileItem | null>(null)
  const [editingFileProfile, setEditingFileProfile] = useState<ProfileItem | null>(null)
  const [editingInfoProfile, setEditingInfoProfile] = useState<ProfileItem | null>(null)
  const { error, setError, updating, profileToDelete, setProfileToDelete, confirmDelete, handleUpdate } = useProfileActions(onRefreshAll)
  const importDraft = useProfileImport({ importRequest, onClearImportRequest, onRefreshAll, error, setError })
  const { showAddModal, setShowAddModal } = importDraft

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

      <DeleteProfileDialog profile={profileToDelete} onCancel={() => setProfileToDelete(null)} onConfirm={confirmDelete} />
    </div>
  )
}
