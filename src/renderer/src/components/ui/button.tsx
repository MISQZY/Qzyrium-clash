import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent font-medium transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90',
        outline:
          'border-border bg-card/60 shadow-xs hover:bg-muted hover:text-foreground text-muted-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/40',
        ghost:
          'hover:bg-muted/80 text-muted-foreground hover:text-foreground',
        destructive:
          'bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25',
        success:
          'bg-success/15 text-success border border-success/30 hover:bg-success/25',
        glow:
          'bg-primary text-primary-foreground hover:bg-primary/90'
      },
      size: {
        default: 'h-9 px-4 py-1.5 text-xs gap-2',
        sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
        lg: 'h-10 px-5 text-sm gap-2 rounded-xl',
        icon: 'size-8 rounded-lg',
        'icon-sm': 'size-7 rounded-md'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
