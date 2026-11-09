import React, { useState } from 'react'
import { Pencil, Check, LoaderCircle, AlertCircle } from 'lucide-react'
import type { ProfileItem } from '@shared/profile'
import { useLocale, useTranslations } from '../i18n'
import { EmojiText } from './EmojiText'
import { profileName } from '../lib/profile-name'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Switch } from './ui/switch'

interface ProfileInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: ProfileItem | null
  onSaved: () => void
}

export const ProfileInfoDialog: React.FC<ProfileInfoDialogProps> = ({
  open,
  onOpenChange,
  profile,
  onSaved
}) => {
  const t = useTranslations('profiles')
  const locale = useLocale()

  const [name, setName] = useState(profile?.name || '')
  const [url, setUrl] = useState(profile?.url || '')
  const [autoUpdate, setAutoUpdate] = useState(profile?.autoUpdate ?? true)
  const [interval, setInterval] = useState(profile?.interval ?? 1440)
  const [customUA, setCustomUA] = useState(profile?.customUA || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when profile changes
  React.useEffect(() => {
    if (profile) {
      setName(profile.name || '')
      setUrl(profile.url || '')
      setAutoUpdate(profile.autoUpdate ?? true)
      setInterval(profile.interval ?? 1440)
      setCustomUA(profile.customUA || '')
      setError(null)
    }
  }, [profile, open])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || !window.api?.profiles?.updateInfo || saving) return

    setSaving(true)
    setError(null)

    try {
      await window.api.profiles.updateInfo(profile.id, {
        name: name.trim() !== profile.name ? name.trim() : undefined,
        url: profile.type === 'remote' ? url.trim() : undefined,
        autoUpdate: profile.type === 'remote' ? autoUpdate : undefined,
        interval: profile.type === 'remote' && autoUpdate ? Number(interval) || 1440 : undefined,
        customUA: profile.type === 'remote' ? customUA.trim() : undefined
      })
      if (profile.type === 'remote' && autoUpdate && window.api?.settings) {
        const cur = await window.api.settings.get()
        await window.api.settings.update({
          general: { ...cur.general, autoUpdateProfiles: true }
        }).catch(() => {})
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  const isRemote = profile.type === 'remote'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-lg p-5 gap-4">
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {/* Header */}
          <DialogHeader className="pb-2 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Pencil className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-sm font-semibold truncate">
                    <EmojiText text={profileName(profile, locale)} />
                  </DialogTitle>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                    {profile.type}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{t('editInfoTitle')}</p>
              </div>
            </div>
          </DialogHeader>

          {/* Form fields */}
          <div className="flex flex-col gap-3.5">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">{t('profileName')}</label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('automaticName')}
                className="h-8.5 text-xs"
              />
            </div>

            {/* Remote specific fields */}
            {isRemote && (
              <>
                {/* Subscription URL */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground">{t('subscriptionURL')}</label>
                  <Input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    className="h-8.5 text-xs font-mono"
                  />
                </div>

                {/* Auto update toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-foreground">{t('autoUpdate')}</span>
                    <span className="text-[11px] text-muted-foreground">{t('updateSubscription')}</span>
                  </div>
                  <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
                </div>

                {/* Update interval */}
                {autoUpdate && (
                  <div className="flex flex-col gap-1.5 pl-1">
                    <label className="text-xs font-medium text-foreground">{t('updateIntervalMinutes')}</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={15}
                        max={43200}
                        value={interval}
                        onChange={(e) => setInterval(Number(e.target.value))}
                        className="h-8.5 w-32 text-xs font-mono"
                      />
                      <div className="flex items-center gap-1">
                        {[
                          { label: '1h', val: 60 },
                          { label: '6h', val: 360 },
                          { label: '12h', val: 720 },
                          { label: '24h', val: 1440 }
                        ].map((preset) => (
                          <Button
                            key={preset.val}
                            type="button"
                            variant={interval === preset.val ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => setInterval(preset.val)}
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom User-Agent */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-foreground">{t('customUA')}</label>
                  <Input
                    type="text"
                    value={customUA}
                    onChange={(e) => setCustomUA(e.target.value)}
                    placeholder={t('customUAPlaceholder')}
                    className="h-8.5 text-xs font-mono"
                  />
                </div>
              </>
            )}
          </div>

          {/* Error notification */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <DialogFooter className="pt-2 border-t border-border/40 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" variant="glow" size="sm" disabled={saving} className="gap-1.5">
              {saving ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  <span>{t('saving')}</span>
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  <span>{t('saveSubscription')}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export default ProfileInfoDialog
