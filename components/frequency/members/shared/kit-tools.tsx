import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { Input } from '@/components/ui/field'

// THE KIT'S FIND-AND-FILTER ROW (Frequency member bodies, members-b.css `.fqm-tools`). The reference
// templates draw a page's filters as chips and its search as one white pill (templates/members/
// Search.html); the platform's index pages carry more controls than the references show (a search,
// six facets, a sort, a map). The hybrid rule keeps every one of them, so they are drawn here in the
// kit's own idiom: a find pill, and each facet as a chip that opens a frosted menu of real links.
//
// Server components with no client state. Every control is a URL: the find pill is a GET form that
// carries the other params as hidden fields, each menu item is a link that sets or clears its own
// param and keeps the rest, so a filtered view stays shareable and the page stays a Server Component.
// A menu is a native <details>, keyed on its current value so it closes when the URL changes.

export type Params = Record<string, string | undefined>

/** `base` with `current` params, `patch` applied on top (null clears a key). Empty values drop. */
export function hrefWith(base: string, current: Params, patch: Record<string, string | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(current)) if (v) sp.set(k, v)
  for (const [k, v] of Object.entries(patch)) {
    if (v) sp.set(k, v)
    else sp.delete(k)
  }
  const s = sp.toString()
  return s ? `${base}?${s}` : base
}

export function FqFindField({
  action,
  value,
  placeholder,
  keep,
  name = 'q',
}: {
  action: string
  value: string | undefined
  placeholder: string
  /** The other params to carry through a search (the active filters). */
  keep: Params
  name?: string
}) {
  return (
    <form method="GET" action={action} className="fqm-find" role="search">
      <FqIcon name="search" />
      <Input variant="seamless" name={name} defaultValue={value ?? ''} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
      {Object.entries(keep).map(([k, v]) => (k !== name && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
    </form>
  )
}

export function FqFacetMenu({
  label,
  paramKey,
  options,
  base,
  current,
  anyLabel = 'Any',
  clearable = true,
  icon,
  counts,
}: {
  label: string
  paramKey: string
  options: { value: string; label: string }[]
  base: string
  current: Params
  /** The clear item's label ("Any", "All"). */
  anyLabel?: string
  /** A sort menu always has a value, so it has no clear item. */
  clearable?: boolean
  icon?: 'filter' | 'chart' | 'pin'
  /** Real counts per option value (`''` = cleared), drawn beside each item. Omit to draw none. */
  counts?: Record<string, number>
}) {
  if (options.length === 0) return null
  const value = current[paramKey]
  const active = options.find((o) => o.value === value)
  return (
    <details key={`${paramKey}:${value ?? ''}`} className="fqm-menu">
      <summary className={active && clearable ? 'chip on' : 'chip'}>
        {icon && <FqIcon name={icon} />}
        {active ? (clearable ? active.label : `${label}: ${active.label}`) : label}
        <FqIcon name="chevron" className="fqm-menu-chev" />
      </summary>
      <div className={counts ? 'fqm-menu-p counted' : 'fqm-menu-p'} role="menu" aria-label={label}>
        {clearable && (
          <Link role="menuitem" href={hrefWith(base, current, { [paramKey]: null })} className={value ? undefined : 'on'}>
            {anyLabel}
            {counts && counts[''] != null && <span className="ev-n-tag">{counts['']}</span>}
          </Link>
        )}
        {options.map((o) => (
          <Link
            key={o.value}
            role="menuitem"
            href={hrefWith(base, current, { [paramKey]: o.value })}
            className={o.value === value ? 'on' : undefined}
            aria-current={o.value === value ? 'true' : undefined}
          >
            {o.label}
            {counts && counts[o.value] != null && <span className="ev-n-tag">{counts[o.value]}</span>}
          </Link>
        ))}
      </div>
    </details>
  )
}

/** "Clear filters", shown only when something is set. */
export function FqClearLink({ base, active }: { base: string; active: boolean }) {
  if (!active) return null
  return (
    <Link className="btn txt sm" href={base}>
      Clear
    </Link>
  )
}
