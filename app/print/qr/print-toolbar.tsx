'use client'

import { Printer } from 'lucide-react'

// The only interactive bit of the print sheet — a toolbar that's hidden when the
// sheet actually prints (`print:hidden`). Layout is chosen via the page's query
// string, so the buttons are plain links that swap `?layout=`.
export function PrintToolbar({
  base,
  layout,
}: {
  base: string
  layout: 'tent' | 'stickers' | 'poster'
}) {
  const tab = (value: 'tent' | 'stickers' | 'poster', label: string) => (
    <a
      href={`${base}&layout=${value}`}
      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
        layout === value
          ? 'border-primary bg-primary text-on-primary'
          : 'border-border text-muted hover:bg-surface-elevated hover:text-text'
      }`}
    >
      {label}
    </a>
  )

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-3 print:hidden">
      <span className="mr-1 text-xs font-medium text-subtle">Layout</span>
      {tab('tent', 'Table tent')}
      {tab('stickers', 'Sticker sheet')}
      {tab('poster', 'Poster')}
      <button
        onClick={() => window.print()}
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        <Printer className="h-3.5 w-3.5" /> Print
      </button>
    </div>
  )
}
