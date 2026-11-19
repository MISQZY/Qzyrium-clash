import type { ReactNode } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import { Button, type ButtonProps } from './button'
import { cn } from '../../lib/utils'

export interface SaveButtonProps extends Omit<ButtonProps, 'children'> {
  saving: boolean
  label: ReactNode
  savingLabel?: ReactNode
}

export function SaveButton({
  saving,
  label,
  savingLabel,
  disabled,
  className,
  variant = 'glow',
  size = 'sm',
  type = 'button',
  ...props
}: SaveButtonProps) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      disabled={disabled || saving}
      aria-busy={saving}
      className={cn('gap-1.5', className)}
      {...props}
    >
      {saving ? (
        <>
          <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
          <span>{savingLabel ?? label}</span>
        </>
      ) : (
        <>
          <Check className="size-3.5 shrink-0" />
          <span>{label}</span>
        </>
      )}
    </Button>
  )
}
