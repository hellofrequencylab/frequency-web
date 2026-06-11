'use client'

import { Search, Sparkles } from 'lucide-react'

// The admin command bar above the content: a search field and an "Ask Vera" action.
// Both reuse the app's existing surfaces rather than introducing parallel ones —
// the search button opens the same ⌘K overlay the member header uses (app-shell
// listens for 'open-search'), and Ask Vera opens the Vera launcher panel
// (vera-launcher listens for 'open-vera'). One search, one assistant.
export function AdminSearchBar() {
  const openSearch = () => window.dispatchEvent(new CustomEvent('open-search'))
  const openVera = () => window.dispatchEvent(new CustomEvent('open-vera'))

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search the admin workspace"
        className="flex flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left text-sm text-subtle transition-colors hover:border-border-strong hover:text-muted"
      >
        <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <span className="flex-1 truncate">Search members, circles, events, settings…</span>
        <kbd className="hidden shrink-0 rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-2xs font-semibold text-subtle sm:inline">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={openVera}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-sm font-bold text-primary-strong transition-colors hover:bg-primary/15"
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        Ask Vera
      </button>
    </div>
  )
}
