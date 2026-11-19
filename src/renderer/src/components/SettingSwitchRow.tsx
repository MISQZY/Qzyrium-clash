import { SettingRow } from './Page'
import { Switch } from './ui/switch'

export interface SettingSwitchRowProps {
  title: string
  description?: string
  checked?: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  id?: string
}

export function SettingSwitchRow({
  title,
  description,
  checked = false,
  onCheckedChange,
  disabled = false,
  ariaLabel = title,
  id
}: SettingSwitchRowProps) {
  return (
    <SettingRow title={title} description={description} id={id}>
      <Switch
        id={id}
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </SettingRow>
  )
}
