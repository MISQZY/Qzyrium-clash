import { DeleteProfileDialog } from '../components/profiles/DeleteProfileDialog'
import { useProfileActions } from '../hooks/useProfileActions'
import { AddProfileDialog } from '../components/profiles/AddProfileDialog'
import { useProfileImport } from '../hooks/useProfileImport'
import { ProfileCard } from '../components/profiles/ProfileCard'
import { useTranslations } from '../i18n'
import React, { lazy, Suspense, useState } from 'react'
import { Plus, Globe, LayoutGrid, LayoutList } from 'lucide-react'

import { ProfileItem } from '@shared/profile'
import { cn } from '../lib/utils'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'

const ProfileEditorDialog = lazy(() => import('../components/ProfileEditorDialog').then((module) => ({ default: module.ProfileEditorDialog })))
const ProfileFileEditorDialog = lazy(() => import('../components/ProfileFileEditorDialog').then((module) => ({ default: module.ProfileFileEditorDialog })))
const ProfileInfoDialog = lazy(() => import('../components/ProfileInfoDialog').then((module) => ({ default: module.ProfileInfoDialog })))

interface ProfilesPageProps {
  profiles: ProfileItem[]
  activeProfile: ProfileItem | null
  onSwitchProfile: (id: string) => void | Promise<unknown>
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
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    try {
      return (localStorage.getItem('profiles_view_mode') as 'list' | 'cards') || 'list'
    } catch {
      return 'list'
    }
  })
  const { error, setError, updating, profileToDelete, setProfileToDelete, confirmDelete, handleUpdate } = useProfileActions(onRefreshAll)
  const importDraft = useProfileImport({ importRequest, onClearImportRequest, onRefreshAll, error, setError })
  const { showAddModal, setShowAddModal } = importDraft

  const toggleViewMode = () => {
    setViewMode((prev) => {
      const next = prev === 'list' ? 'cards' : 'list'
      try {
        localStorage.setItem('profiles_view_mode', next)
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const handleSwitchProfile = async (id: string) => {
    if (switchingId || activeProfile?.id === id) return
    setSwitchingId(id)
    try {
      await Promise.all([
        Promise.resolve(onSwitchProfile(id)),
        new Promise((resolve) => setTimeout(resolve, 350))
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSwitchingId(null)
    }
  }

  const handleToggleDisplayMode = async (profile: ProfileItem) => {
    const currentMode = profile.displayMode ?? profile.serverDisplayMode ?? 'full'
    const nextMode = currentMode === 'full' ? 'single' : 'full'
    try {
      await window.api.profiles.updateInfo(profile.id, { displayMode: nextMode })
      onRefreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className={cn("page-scroll", viewMode === 'cards' && "page-scroll-cards")}>
      {/* Header */}
      <div className="page-heading">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('profiles')}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleViewMode}
            className="gap-1.5 cursor-pointer"
            title={viewMode === 'list' ? t('viewModeCardsTooltip') : t('viewModeListTooltip')}
            aria-label={viewMode === 'list' ? t('viewModeCardsTooltip') : t('viewModeListTooltip')}
          >
            {viewMode === 'list' ? <LayoutGrid className="size-3.5" /> : <LayoutList className="size-3.5" />}
            <span className="hidden sm:inline">{viewMode === 'list' ? t('viewModeCards') : t('viewModeList')}</span>
          </Button>

          <Button
            data-tour="add-profile"
            onClick={() => setShowAddModal(true)}
            variant="glow"
            size="sm"
            className="gap-2"
          >
            <Plus className="size-3.5" />
            <span>{t('addSubscription')}</span>
          </Button>
        </div>
      </div>

      {/* Profile List */}
      {error && !showAddModal && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {profiles.length > 0 ? (
        <div
          className={
            viewMode === 'cards'
              ? 'profiles-cards-container flex flex-row overflow-x-auto overflow-y-hidden gap-4 pb-2 pt-0.5 px-0.5 scrollbar-thin items-stretch'
              : 'flex flex-col gap-3'
          }
        >
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              layout={viewMode}
              isActive={activeProfile?.id === profile.id}
              updating={updating.has(profile.id)}
              isSwitching={switchingId === profile.id}
              isAnySwitching={Boolean(switchingId)}
              onSwitchProfile={handleSwitchProfile}
              onUpdate={handleUpdate}
              onEditInfo={setEditingInfoProfile}
              onEditFile={setEditingFileProfile}
              onDelete={setProfileToDelete}
              onEditRules={setEditingProfile}
              onToggleDisplayMode={handleToggleDisplayMode}
            />
          ))}
        </div>
      ) : (
        <Card className={cn("text-center flex flex-col items-center justify-center", viewMode === 'cards' ? 'profiles-cards-container p-8' : 'p-12')}>
          <Globe className="size-8 text-muted-foreground/40 mb-2" />
          <span className="text-sm font-medium text-foreground">{t('noSubscriptionsLoaded')}</span>
          <span className="text-xs text-muted-foreground mt-1">
            {t('clickAddSubscriptionToImportYourClashMihomoProviderURLOrLocalYAML')}
          </span>
        </Card>
      )}

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
