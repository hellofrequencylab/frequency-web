import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, ScanText, Lock, Globe, MapPin, Search, Contact, UserRoundCheck, Download } from 'lucide-react'
import { contactsOwnerId } from '@/lib/connections/access'
import { googleImportConfigured } from '@/lib/integrations/google/config'
import { listContacts, listDueReminders, type ContactSort as ContactSortKey } from '@/lib/connections/store'
import { findContactMatches } from '@/lib/connections/matching'
import { getInitials } from '@/lib/utils'
import { IndexTemplate } from '@/components/templates'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { EntityCard } from '@/components/cards/entity-card'
import { ContactMatches } from '@/components/connections/contact-matches'
import { ReachOutList } from '@/components/connections/reach-out-list'
import { SpaceCrmPrompt } from '@/components/connections/space-crm-prompt'
import { ContactSort, type ContactSortValue } from '@/components/connections/contact-sort'
import { GoogleImportBanner, type GoogleImportOutcome } from '@/components/connections/google-import-banner'
import { ImportContactsButton } from '@/components/crm/import/import-contacts-button'
import { NetworkTabs } from '@/components/people/network-tabs'
import type { NetworkContactListItem } from '@/lib/connections/types'

const IMPORT_OUTCOMES = ['done', 'cancelled', 'error', 'unavailable'] as const

export const dynamic = 'force-dynamic'

// Two facets share one filter row (CRM-STRATEGY §3.1): how it arrived (Card / QR
// Scan) and where it sits in its lifecycle (New / Active / Archived).
const FACET_TABS = [
  { key: 'all', label: 'All' },
  { key: 'card', label: 'Card' },
  { key: 'qr_scan', label: 'QR Scan' },
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
] as const
type FacetFilter = (typeof FACET_TABS)[number]['key']

const SORTS: ContactSortValue[] = ['recent', 'last_contacted', 'follow_up', 'name']

const SOURCE_LABEL: Record<string, string> = {
  card_scan: 'Scanned', poster: 'Poster', manual: 'Manual', import: 'Imported', qr_scan: 'QR scan',
}

function matches(c: NetworkContactListItem, facet: FacetFilter, q: string): boolean {
  if (facet === 'card' && !(c.source === 'card_scan' || c.source === 'poster')) return false
  if (facet === 'qr_scan' && c.source !== 'qr_scan') return false
  if ((facet === 'new' || facet === 'active' || facet === 'archived') && c.status !== facet) return false
  if (!q) return true
  const hay = [c.displayName, c.company, c.title, c.city, c.email, ...c.tags].join(' ').toLowerCase()
  return hay.includes(q)
}

/** Build a My Contacts URL preserving the active facet, search, and sort. */
function buildHref(facet: FacetFilter, q: string, sort: ContactSortValue): string {
  const sp = new URLSearchParams()
  if (facet !== 'all') sp.set('status', facet)
  if (q) sp.set('q', q)
  if (sort !== 'recent') sp.set('sort', sort)
  const qs = sp.toString()
  return `/network/contacts${qs ? `?${qs}` : ''}`
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    q?: string
    sort?: string
    import?: string
    added?: string
    skipped?: string
  }>
}) {
  const ownerId = await contactsOwnerId()
  if (!ownerId) redirect('/feed')

  const params = await searchParams
  const { status: rawStatus, q: rawQ, sort: rawSort } = params

  // Result banner after returning from the Google contacts import (ADR-374).
  const importOutcome = (IMPORT_OUTCOMES as readonly string[]).includes(params.import ?? '')
    ? (params.import as GoogleImportOutcome)
    : null
  const importAdded = Number(params.added) || 0
  const importSkipped = Number(params.skipped) || 0
  const googleImportEnabled = googleImportConfigured()
  const facet: FacetFilter = (FACET_TABS.find((s) => s.key === rawStatus)?.key ?? 'all') as FacetFilter
  const q = (rawQ ?? '').trim().toLowerCase()
  const sort: ContactSortValue = (SORTS.includes(rawSort as ContactSortValue) ? rawSort : 'recent') as ContactSortValue

  const [all, suggestions, dueReminders] = await Promise.all([
    listContacts(ownerId, 300, sort as ContactSortKey),
    findContactMatches(ownerId),
    listDueReminders(ownerId),
  ])
  const rows = all.filter((c) => matches(c, facet, q))

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hub tab strip — Community · Friends · Contacts read as one Network hub. */}
      <NetworkTabs active="/network/contacts" />
      {/* Mobile header is COMPACT: the H1 drops the icon and the description
          shrinks to one line to save vertical space. sm+ keeps the full header. */}
      <IndexTemplate
        title={
          <span className="flex items-center gap-2">
            <Contact className="hidden h-5 w-5 text-primary-strong sm:block" />
            My Contacts
          </span>
        }
        description={
          <>
            <span className="sm:hidden">People you&rsquo;ve met, private to you.</span>
            <span className="hidden sm:inline">
              People you&rsquo;ve met. Scanned from a card or poster, or added by hand. Private to
              you unless you promote them to your network.
            </span>
          </>
        }
        action={
          <div className="flex items-center gap-2">
            {/* CSV / paste importer into THIS member's own book (owner-scoped): the wizard stages under
                the signed-in caller and commits via commitToMember, so no destination picker is needed. */}
            <ImportContactsButton target={{ kind: 'member' }} label="Import from file" variant="subtle" />
            {googleImportEnabled && (
              <Link
                href="/api/integrations/google/start"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated sm:px-3.5 sm:py-2"
              >
                <Download className="h-4 w-4" /> Import from Google
              </Link>
            )}
            <Link
              href="/connections/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover sm:px-3.5 sm:py-2"
            >
              <Plus className="h-4 w-4" /> New profile
            </Link>
          </div>
        }
        toolbar={
          <div className="flex flex-wrap items-end justify-between gap-3">
            <UnderlineTabs
              activeHref={buildHref(facet, q, sort)}
              tabs={FACET_TABS.map((t) => ({
                href: buildHref(t.key, q, sort),
                label: t.label,
                count: all.filter((c) => matches(c, t.key, q)).length,
              }))}
            />
            <div className="flex flex-wrap items-end gap-2">
              <ContactSort value={sort} />
              <form className="relative pb-2" action="/network/contacts" method="get">
                {facet !== 'all' && <input type="hidden" name="status" value={facet} />}
                {sort !== 'recent' && <input type="hidden" name="sort" value={sort} />}
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-[calc(50%+4px)] text-subtle" />
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search…"
                  className="w-44 rounded-lg border border-border-strong bg-surface py-1.5 pl-8 pr-2 text-sm text-text placeholder-subtle focus:border-border-strong focus:outline-none"
                />
              </form>
            </div>
          </div>
        }
      >
      {importOutcome && (
        <GoogleImportBanner outcome={importOutcome} added={importAdded} skipped={importSkipped} />
      )}
      <ReachOutList reminders={dueReminders} />
      <ContactMatches suggestions={suggestions} />
      {/* A light, dismissible nudge to graduate into a Space CRM, shown only once a member has built up
          some contacts (CRM-STRATEGY §6 P3). Never greets an empty list. */}
      {all.length > 0 && <SpaceCrmPrompt />}
      {rows.length === 0 ? (
        <EmptyState
          icon={ScanText}
          title={all.length === 0 ? 'No profiles yet' : 'Nothing matches that filter'}
          description={all.length === 0 ? 'Scan a business card to harvest someone’s details in seconds.' : undefined}
          action={
            all.length === 0 ? (
              <Link
                href="/connections/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" /> New profile
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <li key={c.id}>
              <EntityCard
                href={`/connections/${c.id}`}
                anchor={
                  c.avatarUrl ? (
                    // Private `network-contacts` bucket served via short-lived signed URLs
                    // (/storage/v1/object/sign/…). `unoptimized` skips Next's image optimizer,
                    // which only allowlists the PUBLIC storage path and would otherwise reject
                    // these (broken avatars) — and re-optimize a new token every request. Matches
                    // the plain <img> used for the card front/back/logo on the detail page.
                    <Image src={c.avatarUrl} alt="" width={44} height={44} unoptimized className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold text-muted">
                      {getInitials(c.displayName ?? '?')}
                    </span>
                  )
                }
                title={c.displayName ?? 'Unnamed'}
                badge={
                  c.visibility === 'network'
                    ? <Globe className="h-3 w-3 shrink-0 text-subtle" aria-label="Shared to your network" />
                    : <Lock className="h-3 w-3 shrink-0 text-subtle" aria-label="Private to you" />
                }
                context={
                  [c.title, c.company].filter(Boolean).join(' · ')
                  || c.city
                  || c.email
                  || undefined
                }
                meta={
                  <>
                    {c.linkedProfileId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 font-medium text-success">
                        <UserRoundCheck className="h-3 w-3" /> On Frequency
                      </span>
                    )}
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full bg-primary-bg px-2 py-0.5 font-medium text-primary-strong">{t}</span>
                    ))}
                    {c.tags.length > 3 && <span>+{c.tags.length - 3}</span>}
                    {c.city && (c.title || c.company) && (
                      <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{c.city}</span>
                    )}
                    <span>{SOURCE_LABEL[c.source] ?? c.source}</span>
                    {c.status !== 'new' && <span className="capitalize">{c.status}</span>}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
      </IndexTemplate>
    </div>
  )
}
