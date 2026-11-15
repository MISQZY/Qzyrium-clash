import React from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ConnectionSectionProps {
  icon: LucideIcon
  title: string
  children: React.ReactNode
  className?: string
}

export function ConnectionSection({ icon: Icon, title, children, className = '' }: ConnectionSectionProps) {
  return (
    <div className={`rounded-xl border border-border/60 bg-muted/15 p-3.5 flex flex-col gap-3 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon className="size-3 text-primary" />
        {title}
      </span>
      {children}
    </div>
  )
}
