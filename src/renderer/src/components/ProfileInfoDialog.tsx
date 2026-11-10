import React, { useId, useState } from 'react'
import { Check, LoaderCircle, Globe, FileCode, RefreshCw, ChevronDown } from 'lucide-react'
import type { ProfileItem } from '@shared/profile'
import { useLocale, useTranslations, useCustomLocalization } from '../i18n'
import { EmojiText } from './EmojiText'
import { profileName } from '../lib/profile-name'
import { profileSource } from '../lib/profile-source'
import { ProfileLogo } from './ProfileLogo'
import { Alert } from './ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'
import { Button } from './ui/button'
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
  const customLocalization = useCustomLocalization()
  const id = useId()
  const presets = [60, 360, 720, 1440]
  const [customInterval, setCustomInterval] = useState(!presets.includes(profile?.interval ?? 1440))

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
      setCustomInterval(![60, 360, 720, 1440].includes(profile.interval ?? 1440))
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
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen) }}>
      <DialogContent className="flex w-[calc(100%-32px)] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 px-5 py-4 pr-12 text-left">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/50 text-primary">
                <ProfileLogo url={profile.profileLogo} className="size-7 rounded-xs object-contain" fallback={isRemote ? <Globe className="size-5" /> : <FileCode className="size-5" />} />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-base">{t('profileSettings')}</DialogTitle>
                <DialogDescription className="truncate">
                  <EmojiText text={profileName(profile, locale, customLocalization)} />
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  {profileSource(profile.url) ?? t(isRemote ? 'remoteSubscription' : 'localYAML')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-5 py-5">
            <fieldset disabled={saving} className="min-w-0 space-y-5">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`${id}-name`} className="text-xs font-medium">{t('displayName')}</label>
                  <span className="text-[11px] text-muted-foreground">{t('optional')}</span>
                </div>
                <Input id={`${id}-name`} type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('automaticName')} aria-describedby={`${id}-name-hint`} />
                <p id={`${id}-name-hint`} className="text-[11px] leading-relaxed text-muted-foreground">{t('displayNameHint')}</p>
              </div>

              {isRemote && <>
                <div className="space-y-2">
                  <label htmlFor={`${id}-url`} className="text-xs font-medium">{t('subscriptionURL')}</label>
                  <Input id={`${id}-url`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." required spellCheck={false} autoCapitalize="none" className="font-mono text-[11px]" aria-describedby={`${id}-url-hint`} />
                  <p id={`${id}-url-hint`} className="text-[11px] leading-relaxed text-muted-foreground">{t('subscriptionLinkHint')}</p>
                </div>

                <section className="overflow-hidden rounded-xl border border-border/70" aria-labelledby={`${id}-auto-label`}>
                  <div className="flex items-center justify-between gap-4 bg-muted/20 p-3.5">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <RefreshCw className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <label id={`${id}-auto-label`} htmlFor={`${id}-auto`} className="cursor-pointer text-xs font-medium">{t('autoUpdate')}</label>
                        <p id={`${id}-auto-hint`} className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t('autoUpdateHint')}</p>
                      </div>
                    </div>
                    <Switch id={`${id}-auto`} checked={autoUpdate} onCheckedChange={setAutoUpdate} aria-describedby={`${id}-auto-hint`} />
                  </div>
                  {autoUpdate && <div className="space-y-3 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <label htmlFor={`${id}-schedule`} className="text-xs font-medium">{t('updateFrequency')}</label>
                      <select id={`${id}-schedule`} className="w-full sm:w-auto sm:min-w-40" value={customInterval ? 'custom' : interval} onChange={(event) => {
                        const custom = event.target.value === 'custom'
                        setCustomInterval(custom)
                        if (!custom) setInterval(Number(event.target.value))
                      }}>
                        <option value={60}>{t('everyHour')}</option>
                        <option value={360}>{t('every6Hours')}</option>
                        <option value={720}>{t('every12Hours')}</option>
                        <option value={1440}>{t('everyDay')}</option>
                        <option value="custom">{t('customInterval')}</option>
                      </select>
                    </div>
                    {customInterval && <div className="space-y-2">
                      <label htmlFor={`${id}-interval`} className="text-[11px] text-muted-foreground">{t('updateIntervalMinutes')}</label>
                      <Input id={`${id}-interval`} type="number" min={15} max={43200} step={1} required value={interval || ''} onChange={(event) => setInterval(Number(event.target.value))} aria-describedby={`${id}-interval-hint`} />
                      <p id={`${id}-interval-hint`} className="text-[11px] text-muted-foreground">{t('intervalHint')}</p>
                    </div>}
                  </div>}
                </section>

                <details className="group rounded-xl border border-border/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-xs font-medium [&::-webkit-details-marker]:hidden">
                    {t('advanced')}
                    <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-2 p-3.5">
                    <label htmlFor={`${id}-ua`} className="text-xs font-medium">{t('customUA')}</label>
                    <Input id={`${id}-ua`} type="text" value={customUA} onChange={(event) => setCustomUA(event.target.value)} placeholder={t('defaultUserAgent')} className="font-mono text-[11px]" aria-describedby={`${id}-ua-hint`} />
                    <p id={`${id}-ua-hint`} className="text-[11px] leading-relaxed text-muted-foreground">{t('userAgentHint')}</p>
                  </div>
                </details>
              </>}
            </fieldset>
            {error && <Alert variant="destructive" className="mt-4 text-xs [overflow-wrap:anywhere]">{error}</Alert>}
          </div>

          <DialogFooter className="shrink-0 gap-2 bg-muted/15 px-5 py-3.5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('cancel')}</Button>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {saving ? t('saving') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export default ProfileInfoDialog
