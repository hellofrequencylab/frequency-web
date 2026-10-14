import { FqIcon } from '@/components/frequency/icon'
import { ImportContactsButton } from '@/components/crm/import/import-contacts-button'
import { getSpaceHealth } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import { contactIdFromRowId, isContactRowId, loadSpaceResonanceRoster } from '@/lib/spaces/resonance-roster'
import type { MemberSummary } from '@/lib/people/member-viewer'
import type { ResonanceTier } from '@/lib/traits/compute'
import { HOME_TZ } from '@/lib/time/zone'
import { SpaceMemberViewer } from '@/components/spaces/crm/space-member-viewer'
import { AdminHead, AdminPageBody, EMPTY, Kpi, n } from '../shared'
import { DAY_MS, visitsByProfile } from '../checkin-stats'
import { loadSpaceCheckins } from '../space-reads'
import { ContactsTable, ExportContactsButton, type ContactRow, type ContactTone } from './contacts-table'
import { ContactsViews } from './contacts-views'

// THE SPACE CONTACTS, FREQUENCY (design_handoff/frequency/templates/admin/Contacts.html). The console's
// Resonance tab under SITE_DESIGN=frequency; DAWN keeps components/spaces/crm/space-resonance-crm.tsx. The
// rows are the SAME roster the DAWN master-detail renders (loadSpaceResonanceRoster: every active member plus
// every un-stitched imported contact), and the head counts are getSpaceHealth, the DAWN stat row's read. Each
// row opens the existing detail: a member's profile, or a contact's page in the Space CRM. Import is the
// existing importer. The console's manage gate authorized the caller before this renders.
//
// Last visit and Visits are the verified check-ins on this Space's events (space-reads.ts loadSpaceCheckins),
// per member. An imported contact has no profile to check in with, and a failed read has no reading: both
// show the design's empty value ("—"). Export writes the rows on screen to a CSV in the browser.
//
// THE WORKSPACE (owner, 2026-10-14: the new console lost the old contact system). Above the table sit the four
// health numbers the DAWN stat row showed, and the page opens on the Workspace view: the SAME master-detail
// roster DAWN renders (SpaceMemberViewer: search, sort, Role/Business/Activity/Tier/Lifecycle facets, the
// selected person's card with stats, timeline, deal stage, notes, custom fields, win-back and the message
// composer), so nothing the old page did is lost. Table is the design's flat list, one click away.

const TIERS: readonly ResonanceTier[] = ['resonant', 'cooling', 'at_risk']
const TONE: Record<ResonanceTier, ContactTone> = { resonant: 'ok', cooling: 'warn', at_risk: 'bad' }

type Visits = ReturnType<typeof visitsByProfile> | null

/** The design's Last visit words: Today, Yesterday, a weekday within the week, else the date. */
function lastVisitLabel(at: number, now: number): string {
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: HOME_TZ }).format(ms)
  if (day(at) === day(now)) return 'Today'
  if (day(at) === day(now - DAY_MS)) return 'Yesterday'
  if (now - at < 6 * DAY_MS) return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: HOME_TZ }).format(at)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: HOME_TZ }).format(at)
}

function toRow(m: MemberSummary, slug: string, visits: Visits, now: number): ContactRow {
  const contact = isContactRowId(m.id)
  const badges = m.badges ?? []
  const tier = TIERS.find((t) => badges.includes(t)) ?? null
  const firstTimer = badges.includes('new')
  const status: ContactRow['status'] = contact
    ? { label: 'Contact', tone: 'n' }
    : firstTimer
      ? { label: 'New', tone: 'n' }
      : tier
        ? { label: tierLabel(tier), tone: TONE[tier] }
        : { label: 'Member', tone: 'n' }
  const seen = !contact && visits ? visits.get(m.id) : undefined
  return {
    id: m.id,
    lastVisit: seen ? lastVisitLabel(seen.last, now) : EMPTY,
    visits: contact || !visits ? EMPTY : n(seen?.visits ?? 0),
    name: m.displayName,
    sub: contact ? m.handle : `@${m.handle}`,
    avatarUrl: m.avatarUrl ?? null,
    source: contact ? 'Contact' : 'Member',
    status,
    href: contact ? `/spaces/${slug}/crm?contact=${encodeURIComponent(contactIdFromRowId(m.id))}` : `/people/${m.handle}`,
    active: !contact && (m.activeThisWeek ?? badges.includes('active:yes')),
    firstTimer: !contact && firstTimer,
    slipping: !contact && (tier === 'cooling' || tier === 'at_risk'),
  }
}

export async function FqContactsBody({
  spaceId,
  slug,
  spaceName,
}: {
  spaceId: string
  slug: string
  spaceName: string
}) {
  const [roster, health, checkins] = await Promise.all([
    loadSpaceResonanceRoster(spaceId),
    getSpaceHealth(spaceId),
    loadSpaceCheckins(spaceId),
  ])
  const visits = checkins ? visitsByProfile(checkins) : null
  const now = new Date().getTime()
  const rows = roster.map((m) => toRow(m, slug, visits, now))

  return (
    <AdminPageBody>
      <AdminHead
        kicker="People through the door"
        title="Contacts"
        meta={`${n(rows.length)} ${rows.length === 1 ? 'person' : 'people'} · ${n(health.weeklyActive)} active this week`}
        actions={
          <>
          <ExportContactsButton rows={rows} filename={`${slug}-contacts.csv`} />
          <ImportContactsButton
            target={{ kind: 'space', spaceId }}
            spaceName={spaceName}
            label="Import"
            variant="bare"
            className="btn pa"
            icon={<FqIcon name="upload" />}
          />
          </>
        }
      />
      <div className="g4 adp-kpi-row">
        <Kpi label="Members" value={n(health.members)} note={health.members === 1 ? 'scored member' : 'scored members'} />
        <Kpi
          label="Active this week"
          value={n(health.weeklyActive)}
          note={health.members === 0 ? 'no members scored yet' : `of ${n(health.members)} scored`}
        />
        <Kpi label="At risk" value={n(health.atRisk)} note="in the red tier" />
        <Kpi
          label="Resonance health"
          value={health.members === 0 ? EMPTY : n(Math.round(health.meanHealth))}
          note={`${n(health.resonant)} resonant · ${n(health.cooling)} cooling`}
        />
      </div>
      <ContactsViews workspace={<SpaceMemberViewer spaceId={spaceId} slug={slug} />} table={<ContactsTable rows={rows} />} />
    </AdminPageBody>
  )
}
