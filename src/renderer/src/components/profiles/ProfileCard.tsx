import { useLocale, useTranslations, useCustomLocalization } from '../../i18n'

import { RefreshCw, Trash2, Globe, FileCode, EllipsisVertical, Pencil, Check, Layers, LayoutList, Megaphone } from 'lucide-react'
import { RulesIcon } from '../../lib/icons'
import { ProfileItem, canToggleProfileDisplayMode, subscriptionUpdateInterval } from '@shared/profile'
import { profileSource } from '../../lib/profile-source'
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
        isCards
          ? 'w-80 sm:w-88 min-w-[20rem] max-w-[22rem] h-full max-h-[640px] shrink-0 flex flex-col justify-between'
          : 'w-full',
        isActive ? 'border-primary ring-1 ring-primary/20 shadow-xs' : 'border-border hover:border-border/80',
        isSwitching && 'profile-switching-card border-primary/50 shadow-md shadow-primary/10'
      )}
    >
      <CardContent className={cn('p-4 sm:p-5 flex flex-col justify-between h-full', isCards ? 'space-y-3.5' : 'space-y-4')}>
        <div className="flex items-start justify-between gap-2.5 shrink-0">
          <div className="flex flex-1 min-w-0 items-center gap-2.5">
            <div
              className={`size-10 shrink-0 rounded-xl flex items-center justify-center overflow-hidden transition-colors ${
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
              <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={profileSource(p.url) ?? (p.type === 'remote' ? t('remoteSubscription') : t('localYAML'))}>
                {profileSource(p.url) ?? (p.type === 'remote' ? t('remoteSubscription') : t('localYAML'))}
              </p>
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

        {isCards ? (
          <div className="flex-1 min-h-0 flex flex-col justify-start space-y-3 overflow-y-auto scrollbar-thin pr-0.5">
            {p.announce && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-2.5 text-xs text-foreground flex items-start gap-2">
                <Megaphone className="size-3.5 text-primary shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed line-clamp-3">{p.announce}</span>
              </div>
            )}

            {p.type === 'remote' ? (
              <SubscriptionInfo info={p.userInfo} compact={true} />
            ) : (
              <div className="rounded-xl border border-border/50 bg-background/25 p-3.5 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-warning/15 text-warning border border-warning/30 flex items-center justify-center shrink-0">
                    <FileCode className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{t('localYAML')}</p>
                    <p className="text-[11px] text-muted-foreground">{t('localYAMLConfigDesc')}</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1.5 border-t border-border/40">
                  {t('yamlProfileHint')}
                </p>
              </div>
            )}

            {p.deviceStatus && (
              <div role="status" className="rounded-lg border border-warning/25 bg-warning/5 p-2.5 text-xs text-warning">
                <p className="text-[11px]">{t(p.deviceStatus === 'limit' ? 'deviceLimitNotice' : 'hwidRequiredNotice')}</p>
                {p.supportUrl?.startsWith('https://') && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto p-0 text-[11px] text-warning underline underline-offset-2"
                    onClick={() => { void window.api.app.openUrl(p.supportUrl!) }}
                  >
                    {t('providerSupport')}
                  </Button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border/50 bg-background/25 p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block">{t('autoUpdate')}</span>
                  <span className="font-medium text-xs text-foreground block truncate mt-0.5">
                    {p.type === 'remote'
                      ? p.autoUpdate
                        ? `${subscriptionUpdateInterval(p)} мин.`
                        : t('autoUpdateDisabled')
                      : t('localYAML')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">{t('displayMode')}</span>
                  <span className="font-medium text-xs text-foreground block truncate mt-0.5">
                    {t(isFull ? 'displayModeFull' : 'displayModeSingle')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">{t('customRulesTab')}</span>
                  <span className="font-medium text-xs text-foreground block truncate mt-0.5">
                    {p.customRules?.length ? `${p.customRules.length} шт.` : t('noCustomRules')}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">{t('updateViaProxy')}</span>
                  <span className="font-medium text-xs text-foreground block truncate mt-0.5">
                    {p.updateViaProxy ? t('enabledShort') : t('disabledShort')}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEditRules(p)}
                disabled={isSwitching}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground justify-center cursor-pointer"
                title={t('editRules')}
              >
                <RulesIcon className="size-3.5 shrink-0" />
                <span>{t('editRules')}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEditFile(p)}
                disabled={isSwitching}
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground justify-center cursor-pointer"
                title={t('editFile')}
              >
                <FileCode className="size-3.5 shrink-0" />
                <span>{t('editFile')}</span>
              </Button>
            </div>
          </div>
        ) : (
          <>
            {p.type === 'remote' && <SubscriptionInfo info={p.userInfo} compact={false} />}
            {p.deviceStatus && (
              <div role="status" className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs text-warning">
                <p>{t(p.deviceStatus === 'limit' ? 'deviceLimitNotice' : 'hwidRequiredNotice')}</p>
                {p.supportUrl?.startsWith('https://') && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto p-0 text-warning underline underline-offset-2"
                    onClick={() => { void window.api.app.openUrl(p.supportUrl!) }}
                  >
                    {t('providerSupport')}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {isCards ? (
          <div className="border-t border-border/60 pt-3 mt-auto flex flex-col gap-2 shrink-0">
            <p className="text-[10px] text-muted-foreground truncate" title={dateStr}>
              {t('updated', { date: dateStr })}
            </p>
            {isActive ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled
                className="w-full h-8.5 gap-1.5 px-3 text-xs font-semibold bg-primary/15 text-primary border border-primary/30 opacity-100 cursor-default select-none shadow-2xs justify-center"
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
                className="w-full h-8.5 gap-1.5 px-3 text-xs font-medium latency-testing-button border-primary/40 text-primary relative shadow-2xs justify-center"
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
                className="w-full h-8.5 gap-1.5 px-3 text-xs font-medium border-border/80 text-foreground hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer shadow-2xs active:scale-[0.98] justify-center"
                title={t('select')}
                aria-label={t('select')}
              >
                <span>{t('select')}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 pt-3 mt-auto shrink-0">
            <p className="text-[10px] text-muted-foreground truncate" title={dateStr}>
              {t('updated', { date: dateStr })}
            </p>
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
        )}
      </CardContent>
    </Card>
  )
}
