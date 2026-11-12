import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { ProfileItem } from '@shared/profile'
import { useLocale, useCustomLocalization } from '../i18n'
import { profileName } from '../lib/profile-name'
import { EmojiText } from './EmojiText'
import { Badge } from './ui/badge'
import { DialogHeader, DialogTitle } from './ui/dialog'

interface ProfileEditorHeaderProps {
  profile: ProfileItem
  icon: LucideIcon
  description: string
  children?: ReactNode
}

export function ProfileEditorHeader({ profile, icon: Icon, description, children }: ProfileEditorHeaderProps) {
  const locale = useLocale()
  const customLocalization = useCustomLocalization()

  return (
    <DialogHeader className="pb-2 border-b border-border/60 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Icon className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-sm font-semibold truncate">
                <EmojiText text={profileName(profile, locale, customLocalization)} />
              </DialogTitle>
              <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                {profile.type}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{description}</p>
          </div>
        </div>
        {children}
      </div>
    </DialogHeader>
  )
}
