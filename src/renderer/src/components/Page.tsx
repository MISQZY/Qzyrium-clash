import type { ReactNode } from 'react'

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="page-scroll">
    <header className="page-heading">
      <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight">{title}</h1></div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
    {children}
  </section>
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="setting-row"><div className="min-w-0"><p className="text-sm font-medium">{title}</p>{description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}</div><div className="shrink-0">{children}</div></div>
}
