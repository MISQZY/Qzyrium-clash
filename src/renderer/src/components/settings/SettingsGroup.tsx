import type { ReactNode } from 'react'
import { Card, CardContent } from '../ui/card'
import { ChevronRight } from 'lucide-react'

export function SettingsGroup({ title, description, icon, children, collapsible = false }: { title: string; description: string; icon: ReactNode; children: ReactNode; collapsible?: boolean }) {
  const heading = <>
    <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="text-primary [&>svg]:size-4">{icon}</span>{title}</h2>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
  </>
  const content = <div className="min-w-0 [&_.setting-row]:py-3">{children}</div>
  return <Card><CardContent className="p-5">
    {collapsible ? <details className="group/settings min-w-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">{heading}</div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open/settings:rotate-90" />
      </summary>
      <div className="mt-3 border-t border-border/60 pt-3">{content}</div>
    </details> : <>
      <div className="mb-3 border-b border-border/60 pb-3">{heading}</div>
      {content}
    </>}
  </CardContent></Card>
}
