import { ImportContactsButton } from '@/components/crm/import/import-contacts-button'
import { getSpaceHealth } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import { contactIdFromRowId, isContactRowId, loadSpaceResonanceRoster } from '@/lib/spaces/resonance-roster'
import type { MemberSummary } from '@/lib/people/member-viewer'
import type { ResonanceTier } from '@/lib/traits/compute'
import { AdminHead, AdminPageBody, n } from '../shared'
import { ContactsTable, type ContactRow, type ContactTone } from './contacts-table'

// THE SPACE CONTACTS, FREQUENCY (design_handoff/frequency/templates/admin/Contacts.html). The console's
// Resonance tab under SITE_DESIGN=frequency; DAWN keeps components/spaces/crm/space-resonance-crm.tsx. The
// rows are the SAME roster the DAWN master-detail renders (loadSpaceResonanceRoster: every active member plus
// every un-stitched imported contact), and the head counts are getSpaceHealth, the DAWN stat row's read. Each
// row opens the existing detail: a member's profile, or a contact's page in the Space CRM. Import is the
// existing importer. The console's manage gate authorized the caller before this renders.
//
// NO READING, SO THE DESIGN'S EMPTY VALUE ("—"): the Last visit and Visits columns. No Export action exists,
// so the design's Export button is not drawn.

const TIERS: readonly ResonanceTier[] = ['resonant', 'cooling', 'at_risk']
const TONE: Record<ResonanceTier, ContactTone> = { resonant: 'ok', cooling: 'warn', at_risk: 'bad' }

function toRow(m: MemberSummary, slug: string): ContactRow {
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
  return {
    id: m.id,
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
  const [roster, health] = await Promise.all([loadSpaceResonanceRoster(spaceId), getSpaceHealth(spaceId)])
  const rows = roster.map((m) => toRow(m, slug))

  return (
    <AdminPageBody>
      <AdminHead
        kicker="People through the door"
        title="Contacts"
        meta={`${n(rows.length)} ${rows.length === 1 ? 'person' : 'people'} · ${n(health.weeklyActive)} active this week`}
        actions={
          <ImportContactsButton
            target={{ kind: 'space', spaceId }}
            spaceName={spaceName}
            label="Import"
            variant="bare"
            className="btn pa"
          />
        }
      />
      <ContactsTable rows={rows} />
    </AdminPageBody>
  )
}
