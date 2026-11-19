import { Switch } from './ui/switch'
import { cn } from '../lib/utils'

export interface CompactSwitchRowProps {
  id: string
  label: string
  description?: string
  checked?: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  descriptionClassName?: string
  className?: string
}

export function CompactSwitchRow({
  id,
  label,
  description,
  checked = false,
  disabled = false,
  onCheckedChange,
  descriptionClassName,
  className
}: CompactSwitchRowProps) {
  const hintId = description ? `${id}-hint` : undefined
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="space-y-0.5">
        <label htmlFor={id} className="cursor-pointer text-xs font-medium">
          {label}
        </label>
        {description && (
          <p id={hintId} className={cn('text-[11px] leading-relaxed text-muted-foreground', descriptionClassName)}>
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={hintId}
      />
    </div>
  )
}
