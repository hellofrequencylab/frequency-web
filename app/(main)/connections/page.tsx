import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ContactRound, Plus, ScanText, Lock, Globe, Mail, Building2, MapPin, Search } from 'lucide-react'
import { connectionsOwnerId } from '@/lib/connections/access'
import { listContacts } from '@/lib/connections/store'
import { getInitials } from '@/lib/utils'
import type { ContactStatus, NetworkContactListItem } from '@/lib/connections/types'

export const dynamic = 'force-dynamic'

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
] as const
type StatusFilter = (typeof STATUS_TABS)[number]['key']

const SOURCE_LABEL: Record<string, string> = {
  card_scan: 'Scanned', poster: 'Poster', manual: 'Manual', import: 'Imported',
}

function matches(c: NetworkContactListItem, status: StatusFilter, q: string): boolean {
  if (status !== 'all' && c.status !== (status as ContactStatus)) return false
  if (!q) return true
  const hay = [c.displayName, c.company, c.title, c.city, c.email, ...c.tags].join(' ').toLowerCase()
  return hay.includes(q)
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const ownerId = await connectionsOwnerId()
  if (!ownerId) redirect('/feed')

  const { status: rawStatus, q: rawQ } = await searchParams
  const status: StatusFilter = (STATUS_TABS.find((s) => s.key === rawStatus)?.key ?? 'all') as StatusFilter
  const q = (rawQ ?? '').trim().toLowerCase()

  const all = await listContacts(ownerId)
  const rows = all.filter((c) => matches(c, status, q))

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ContactRound className="h-5 w-5 text-primary-strong" />
          <h1 className="text-2xl font-bold text-text">Profiles</h1>
        </div>
        <Link
          href="/connections/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" /> New profile
        </Link>
      </div>
      <p className="mb-5 text-sm text-muted">
        People you’ve met — scanned from a card or poster, or added by hand. Private to you unless you promote them to your network.
      </p>

      {/* Status filter + search */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border">
        <div className="flex gap-1">
          {STATUS_TABS.map((t) => {
            const active = status === t.key
            const count = all.filter((c) => matches(c, t.key, q)).length
            const href = t.key === 'all'
              ? `/connections${q ? `?q=${encodeURIComponent(q)}` : ''}`
              : `/connections?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`
            return (
              <Link
                key={t.key}
                href={href}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active ? 'border-primary text-primary-strong' : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {t.label} <span className="text-subtle">{count}</span>
              </Link>
            )
          })}
        </div>
        <form className="relative pb-2" action="/connections" method="get">
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-[calc(50%+4px)] text-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search…"
            className="w-44 rounded-lg border border-border-strong bg-surface py-1.5 pl-8 pr-2 text-sm text-text placeholder-subtle focus:border-primary focus:outline-none"
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
          <ScanText className="mx-auto h-7 w-7 text-subtle" />
          <p className="mt-3 text-sm font-medium text-text">
            {all.length === 0 ? 'No profiles yet' : 'Nothing matches that filter'}
          </p>
          {all.length === 0 && (
            <>
              <p className="mt-1 text-sm text-muted">Scan a business card to harvest someone’s details in seconds.</p>
              <Link
                href="/connections/new"
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" /> New profile
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/connections/${c.id}`}
                className="flex h-full flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
              >
                <div className="flex items-start gap-3">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold text-muted">
                      {getInitials(c.displayName ?? '?')}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-text">
                      {c.displayName ?? 'Unnamed'}
                      {c.visibility === 'network'
                        ? <Globe className="h-3 w-3 shrink-0 text-subtle" />
                        : <Lock className="h-3 w-3 shrink-0 text-subtle" />}
                    </p>
                    {(c.title || c.company) && (
                      <p className="truncate text-xs text-muted">
                        {[c.title, c.company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                <dl className="mt-3 space-y-1 text-xs text-subtle">
                  {c.email && (
                    <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{c.email}</span></div>
                  )}
                  {c.company && !c.title && (
                    <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{c.company}</span></div>
                  )}
                  {c.city && (
                    <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{c.city}</span></div>
                  )}
                </dl>

                {c.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.tags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-md bg-primary-bg px-1.5 py-0.5 text-[11px] font-medium text-primary-strong">{t}</span>
                    ))}
                    {c.tags.length > 4 && <span className="text-[11px] text-subtle">+{c.tags.length - 4}</span>}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2 pt-2 text-[11px] text-subtle">
                  <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 font-medium">{SOURCE_LABEL[c.source] ?? c.source}</span>
                  {c.status !== 'new' && <span className="capitalize">{c.status}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
