import { Switch } from '../ui/switch'
import { cn } from '../../lib/utils'

export interface RuleParamSwitchProps {
  param: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  textClassName?: string
}

export function RuleParamSwitch({
  param,
  checked,
  onCheckedChange,
  disabled = false,
  className,
  textClassName
}: RuleParamSwitchProps) {
  return (
    <label className={cn('flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none', className)}>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <span className={textClassName}>{param}</span>
    </label>
  )
}
