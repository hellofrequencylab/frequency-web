'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

// URL-as-state filter bar for Index/Queue surfaces (ADR-233 §4/§5, GitHub qualifier
// filters + Retool toolbar). Filter + search state lives in the query string so the
// Server Component renders it and the view is shareable/bookmarkable. Sits in the table
// tile above <DataTable>. Selected non-default filters show as removable chips.
//
//   <FilterBar
//     search="q"
//     filters={[{ key:'status', label:'Status',
//       options:[{value:'open',label:'Open'},{value:'closed',label:'Closed'}] }]} />

export interface FilterDef {
  key: string
  label: string
  options: { value: string; label: string }[]
}

export function FilterBar({
  filters = [],
  search,
  searchPlaceholder = 'Search…',
}: {
  filters?: FilterDef[]
  /** Query key for the free-text search box (omit to hide it). */
  search?: string
  searchPlaceholder?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set(key, value)
      else next.delete(key)
      // Any filter change resets pagination.
      next.delete('page')
      router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname)
    },
    [params, pathname, router],
  )

  const active = filters
    .map((f) => ({ f, value: params.get(f.key) }))
    .filter((x): x is { f: FilterDef; value: string } => !!x.value)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              type="search"
              defaultValue={params.get(search) ?? ''}
              placeholder={searchPlaceholder}
              onChange={(e) => setParam(search, e.target.value || null)}
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-sm text-text placeholder:text-subtle focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
        {filters.map((f) => (
          <select
            key={f.key}
            value={params.get(f.key) ?? ''}
            onChange={(e) => setParam(f.key, e.target.value || null)}
            aria-label={f.label}
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm font-medium text-text focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map(({ f, value }) => {
            const opt = f.options.find((o) => o.value === value)
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setParam(f.key, null)}
                className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2.5 py-0.5 text-xs font-semibold text-primary-strong transition-colors hover:bg-primary-bg/70"
              >
                {f.label}: {opt?.label ?? value}
                <X className="h-3 w-3" aria-hidden />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
