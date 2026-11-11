import { ProfileCard } from '../components/profiles/ProfileCard'
import { useLocale, useTranslations, useCustomLocalization } from '../i18n'
import React, { lazy, Suspense, useRef, useState } from 'react'
import { Plus, Globe } from 'lucide-react'

import { ProfileItem } from '@shared/profile'
import { parseSubscriptionImportUrl } from '@shared/clash-url'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog'

import { Input } from '../components/ui/input'
import { Switch } from '../components/ui/switch'
import { Textarea } from '../components/ui/textarea'

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

  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProfile, setEditingProfile] = useState<ProfileItem | null>(null)
  const [editingFileProfile, setEditingFileProfile] = useState<ProfileItem | null>(null)
  const [editingInfoProfile, setEditingInfoProfile] = useState<ProfileItem | null>(null)
  const [profileName, setProfileName] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [profileType, setProfileType] = useState<'remote' | 'local'>('remote')
  const [updateViaProxy, setUpdateViaProxy] = useState(false)
  const [yamlContent, setYamlContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pendingUpdates = useRef(new Set<string>())
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [profileToDelete, setProfileToDelete] = useState<ProfileItem | null>(null)

  React.useEffect(() => {
    if (importRequest?.url) {
      setProfileType('remote')
      const parsed = parseSubscriptionImportUrl(importRequest.url)
      setProfileUrl(parsed.url)
      setProfileName(importRequest.name || parsed.name || '')
      setUpdateViaProxy(false)
      setShowAddModal(true)
      onClearImportRequest?.()
    }
  }, [importRequest, onClearImportRequest])

  const handleUrlChange = (value: string) => {
    const parsed = parseSubscriptionImportUrl(value)
    setProfileUrl(parsed.url)
    if (parsed.name && !profileName.trim()) {
      setProfileName(parsed.name)
    }
  }

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.api || submitting) return

    setSubmitting(true)
    setError('')
    try {
      await window.api.profiles.add({
        name: profileName.trim() || undefined,
        url: profileType === 'remote' ? profileUrl.trim() : undefined,
        type: profileType,
        updateViaProxy: profileType === 'remote' ? updateViaProxy : undefined,
        content: profileType === 'local' ? yamlContent : undefined
      })
      setShowAddModal(false)
      setProfileName('')
      setProfileUrl('')
      setUpdateViaProxy(false)
      setYamlContent('')
      onRefreshAll()
    } catch (err) {
      setError(t('addFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setSubmitting(false)
    }
  }

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
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <form onSubmit={handleAddProfile} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t('addSubscription')}</DialogTitle>
              <DialogDescription>
                {t('importARemoteClashMihomoSubscriptionLinkOrPasteLocalYAML')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={profileType === 'remote' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setProfileType('remote')}
                className="flex-1"
              >
                {t('remoteURL')}
              </Button>
              <Button
                type="button"
                variant={profileType === 'local' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setProfileType('local')}
                className="flex-1"
              >
                {t('localYAML')}
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-name" className="text-xs text-muted-foreground font-medium">{t('profileName')}</label>
              <Input
                id="profile-name"
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder={t('automaticName')}
              />
            </div>

            {profileType === 'remote' ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground font-medium">{t('subscriptionURL')}</label>
                  <Input
                    type="text"
                    required
                    value={profileUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder={t('importUrlPlaceholder')}
                  />
                  <p className="text-[10px] text-muted-foreground/75 leading-tight">
                    {t('clashUrlSupportHint')}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="space-y-0.5">
                    <label htmlFor="add-update-via-proxy" className="text-xs font-medium cursor-pointer">
                      {t('updateViaProxy')}
                    </label>
                    <p className="text-[10px] text-muted-foreground">
                      {t('updateViaProxyHint')}
                    </p>
                  </div>
                  <Switch
                    id="add-update-via-proxy"
                    checked={updateViaProxy}
                    onCheckedChange={setUpdateViaProxy}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium">{t('yAMLContent')}</label>
                <Textarea
                  required
                  rows={5}
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  placeholder={t('pasteYAMLContentHere')}
                />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" variant="glow" size="sm" disabled={submitting}>
                {submitting ? t('downloading') : t('saveSubscription')}
              </Button>
            </DialogFooter>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </form>
        </DialogContent>
      </Dialog>

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
