import { useLocale, useTranslations, useCustomLocalization } from '../../i18n'

import { RefreshCw, Trash2, Globe, FileCode, EllipsisVertical, Pencil, Check, Layers, LayoutList } from 'lucide-react'
import { RulesIcon } from '../../lib/icons'
import { ProfileItem, canToggleProfileDisplayMode } from '@shared/profile'
import { cn } from '../../lib/utils'

import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../ui/dropdown-menu'

import { EmojiText } from '../EmojiText'
import { ProfileLogo } from '../ProfileLogo'

import { profileName as displayName } from '../../lib/profile-name'
import { SubscriptionInfo } from '../SubscriptionInfo'

interface ProfileCardProps {
  profile: ProfileItem
  isActive: boolean
  updating: boolean
  isSwitching?: boolean
  isAnySwitching?: boolean
  layout?: 'list' | 'cards'
  onSwitchProfile: (id: string) => void
  onUpdate: (id: string) => void
  onEditInfo: (profile: ProfileItem) => void
  onEditFile: (profile: ProfileItem) => void
  onDelete: (profile: ProfileItem) => void
  onEditRules: (profile: ProfileItem) => void
  onToggleDisplayMode?: (profile: ProfileItem) => void
}

export function ProfileCard({
  profile: p,
  isActive,
  updating,
  isSwitching = false,
  isAnySwitching = false,
  layout = 'list',
  onSwitchProfile,
  onUpdate,
  onEditInfo,
  onEditFile,
  onDelete,
  onEditRules,
  onToggleDisplayMode
}: ProfileCardProps) {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const customLocalization = useCustomLocalization()
  const canToggleDisplayMode = canToggleProfileDisplayMode(p)
  const isFull = (p.displayMode ?? p.serverDisplayMode ?? 'full') === 'full'
  const dateStr = new Date(p.updatedAt).toLocaleString(locale)
  const isCards = layout === 'cards'

  return (
    <Card
      key={p.id}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'bg-card transition-all relative',
        isCards ? 'w-72 min-w-[18rem] max-w-[18rem] shrink-0 flex flex-col justify-between' : 'w-full',
        isActive ? 'border-primary ring-1 ring-primary/20 shadow-xs' : 'border-border hover:border-border/80',
        isSwitching && 'profile-switching-card border-primary/50 shadow-md shadow-primary/10'
      )}
    >
      <CardContent className={cn('p-4 flex flex-col justify-between', isCards ? 'space-y-3 h-full' : 'space-y-4')}>
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex flex-1 min-w-0 items-center gap-2.5">
            <div
              className={`size-9 shrink-0 rounded-lg flex items-center justify-center overflow-hidden transition-colors ${
                p.type === 'remote'
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'bg-warning/15 text-warning border border-warning/30'
              }`}
            >
              <ProfileLogo
                url={p.profileLogo}
                className="size-6 object-contain rounded-xs"
                fallback={
                  p.type === 'remote' ? (
                    <Globe className="size-4 shrink-0" />
                  ) : (
                    <FileCode className="size-4 shrink-0" />
                  )
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground block" title={displayName(p, locale, customLocalization)}>
                  <EmojiText text={displayName(p, locale, customLocalization)} />
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!isCards && canToggleDisplayMode && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                title={t(isFull ? 'displayModeFullTooltip' : 'displayModeSingleTooltip')}
                aria-label={t(isFull ? 'displayModeFullTooltip' : 'displayModeSingleTooltip')}
                onClick={() => onToggleDisplayMode?.(p)}
                disabled={isSwitching}
                aria-pressed={isFull}
                className={cn('cursor-pointer transition-colors', isFull ? 'text-primary border-primary/40 bg-primary/10 shadow-2xs' : 'text-muted-foreground hover:text-foreground')}
              >
                {isFull ? <Layers className="size-3.5 shrink-0" /> : <LayoutList className="size-3.5 shrink-0" />}
              </Button>
            )}
            {!isCards && (
              <Button
                variant="outline"
                size="icon-sm"
                title={t('editInfo')}
                aria-label={t('editInfo')}
                onClick={() => onEditInfo(p)}
                disabled={isSwitching}
              >
                <Pencil className="size-3.5 shrink-0" />
              </Button>
            )}
            {p.type === 'remote' && (
              <Button
                onClick={() => onUpdate(p.id)}
                variant="outline"
                size="icon-sm"
                title={t('updateSubscription')}
                aria-label={t('updateSubscription')}
                aria-busy={updating}
                disabled={updating || isSwitching}
              >
                <RefreshCw className={`size-3.5 shrink-0${updating ? ' animate-spin' : ''}`} />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="cursor-pointer"
                  title={t('moreActions')}
                  aria-label={t('moreActions')}
                  disabled={isSwitching}
                >
                  <EllipsisVertical className="size-3.5 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {isCards && canToggleDisplayMode && (
                  <DropdownMenuItem
                    onClick={() => onToggleDisplayMode?.(p)}
                    disabled={isSwitching}
                    className="gap-2 cursor-pointer"
                  >
                    {isFull ? <LayoutList className="size-3.5 text-muted-foreground" /> : <Layers className="size-3.5 text-muted-foreground" />}
                    <span>{t(isFull ? 'switchToSingleMode' : 'switchToFullMode')}</span>
                  </DropdownMenuItem>
                )}
                {isCards && (
                  <DropdownMenuItem
                    onClick={() => onEditInfo(p)}
                    disabled={isSwitching}
                    className="gap-2 cursor-pointer"
                  >
                    <Pencil className="size-3.5 text-muted-foreground" />
                    <span>{t('editInfo')}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onEditFile(p)}
                  className="gap-2 cursor-pointer"
                >
                  <FileCode className="size-3.5 text-muted-foreground" />
                  <span>{t('editFile')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(p)}
                  className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  <span>{t('deleteProfile')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
    
        {p.type === 'remote' && <SubscriptionInfo info={p.userInfo} compact={isCards} />}
        {p.deviceStatus && <div role="status" className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs text-warning">
          <p>{t(p.deviceStatus === 'limit' ? 'deviceLimitNotice' : 'hwidRequiredNotice')}</p>
          {p.supportUrl?.startsWith('https://') && <Button type="button" variant="ghost" size="sm" className="mt-1 h-auto p-0 text-warning underline underline-offset-2"
            onClick={() => { void window.api.app.openUrl(p.supportUrl!) }}>{t('providerSupport')}</Button>}
        </div>}
    
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 pt-3 mt-auto">
          <p className="text-[10px] text-muted-foreground truncate" title={dateStr}>{t('updated', { date: dateStr })}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            {isActive ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled
                className="h-7 gap-1 px-2.5 text-xs font-semibold bg-primary/15 text-primary border border-primary/30 opacity-100 cursor-default select-none shadow-2xs"
                aria-label={t('active')}
              >
                <Check className="size-3.5 stroke-[2.5]" />
                <span>{t('active')}</span>
              </Button>
            ) : isSwitching ? (
              <Button
                type="button"
                disabled
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs font-medium latency-testing-button border-primary/40 text-primary relative shadow-2xs"
                aria-busy="true"
                aria-label={t('activating')}
              >
                <span className="latency-loader" />
                <span>{t('activating')}</span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => onSwitchProfile(p.id)}
                disabled={isAnySwitching}
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs font-medium border-border/80 text-foreground hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
                title={t('select')}
                aria-label={t('select')}
              >
                <span>{t('select')}</span>
              </Button>
            )}
            <Button
              type="button"
              onClick={() => onEditRules(p)}
              variant="outline"
              size="icon-sm"
              title={t('editRules')}
              aria-label={t('editRules')}
              disabled={isSwitching}
            >
              <RulesIcon className="size-3.5 shrink-0" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
