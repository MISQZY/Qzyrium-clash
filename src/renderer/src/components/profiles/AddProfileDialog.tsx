import { useTranslations } from '../../i18n'

import { Button } from '../ui/button'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Textarea } from '../ui/textarea'

import type { ProfileImportDraft } from '../../hooks/useProfileImport'

export function AddProfileDialog({ draft }: { draft: ProfileImportDraft }) {
  const t = useTranslations('profiles')
  const { showAddModal, setShowAddModal, profileName, setProfileName, profileUrl, profileType, setProfileType, updateViaProxy, setUpdateViaProxy, yamlContent, setYamlContent, submitting, error, handleUrlChange, handleAddProfile } = draft
  return (
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
  )
}
