import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { fieldStyles } from './field-styles'

// Keep native form semantics and keyboard navigation, with the shared field appearance.
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldStyles, 'h-8.5 cursor-pointer py-1 pl-3 pr-8 font-sans disabled:cursor-not-allowed', className)} {...props}>
      {children}
    </select>
  )
)
NativeSelect.displayName = 'NativeSelect'
