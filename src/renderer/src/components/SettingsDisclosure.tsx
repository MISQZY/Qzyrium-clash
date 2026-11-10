import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export function SettingsDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group/disclosure mt-3 min-w-0 rounded-lg border border-border/60 bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-3 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/disclosure:rotate-90" />
      </summary>
      <div className="flex min-w-0 flex-col gap-3 px-3 pb-3">{children}</div>
    </details>
  )
}
