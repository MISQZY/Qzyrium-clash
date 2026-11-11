import type { ReactNode } from 'react'
import { Card, CardContent } from '../ui/card'

export function SettingsGroup({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return <Card><CardContent className="p-5 flex flex-col gap-3">
    <div className="border-b border-border/60 pb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="text-primary [&>svg]:size-4">{icon}</span>{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
    <div className="min-w-0 [&_.setting-row]:py-3">{children}</div>
  </CardContent></Card>
}
