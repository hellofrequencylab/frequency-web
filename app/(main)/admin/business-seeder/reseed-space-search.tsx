'use client'

// ADMIN-ONLY re-seed picker (Importer v2): search any ACTIVE Space and open its master profile to
// re-seed it. The search action is gated to platform admins (web_role admin/janitor); this component is
// only rendered for them. Picking a Space adopts-or-opens its master profile (idempotent) and routes into
// the review board, where the admin re-voices, changes the mood, adds images, and re-applies.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { searchActiveSpaces, adoptSpaceMasterProfile, type SpaceSearchResult } from './actions'

export function ReseedSpaceSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SpaceSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [, startAdopt] = useTransition()

  function run() {
    setError(null)
    startSearch(async () => {
      const res = await searchActiveSpaces(query)
      setResults(res)
      setSearched(true)
    })
  }

  function reseed(id: string) {
    setError(null)
    setBusyId(id)
    startAdopt(async () => {
      const res = await adoptSpaceMasterProfile(id)
      if (!res.ok) {
        setError(res.error)
        setBusyId(null)
        return
      }
      router.push(`/admin/business-seeder/${res.intakeId}`)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
            placeholder="Search active Spaces by name or slug…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </form>

      {error && <p className="mt-2 text-2xs text-danger">{error}</p>}

      {searched && results.length === 0 && !searching && (
        <p className="mt-3 text-xs text-muted">No active Spaces match that. Try a different name or slug.</p>
      )}

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {results.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 bg-surface px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{s.name}</p>
                <p className="truncate text-2xs text-subtle">
                  /{s.slug} · {s.type}
                  {s.seeded ? ' · has a master profile' : ' · new master profile'}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => reseed(s.id)} disabled={busyId === s.id}>
                {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Re-seed
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
