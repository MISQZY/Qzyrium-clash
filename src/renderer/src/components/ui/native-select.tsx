import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { fieldStyles } from './field-styles'

// The customizable native picker shares the application's menu and field styles.
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldStyles, 'native-select h-8.5 cursor-pointer px-3 py-1 font-sans disabled:cursor-not-allowed', className)} {...props}>
      {children}
    </select>
  )
)
NativeSelect.displayName = 'NativeSelect'
