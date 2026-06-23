// PER-SPACE CONTACT DETAIL — the owner-gated read model behind a Space CRM's contact detail surface
// (CRM-STRATEGY §6). Gathers everything the detail view shows for ONE contact of ONE Space:
//   • identity + fields (name, email, phone, company, city) — name/email from the Space `contacts`
//     row; phone/company/city are enriched from any linked `network_contacts` capture (matched by
//     lowercased email, the person-stitch join, ADR-130), since `contacts` itself holds no such fields.
//   • the TIMELINE — contact_interactions for this contact (lib/crm/interactions.ts), folded together
//     with the Space's private client_notes (lib/crm/client-notes.ts) via buildTimeline.
//   • the contact's DEALS in this Space (crm_deals filtered by space_id + contact_id).
//
// GATING: this is owner data (private notes + a third party's contact info), so every read is gated on
// the Space EDITOR (getSpaceCapabilities canEditProfile) and double-scoped: the contact must belong to
// THIS Space (getContact(id, spaceId)), and every fold is space-scoped. FAIL-SAFE: an anonymous /
// non-editor caller, a contact that is not in this Space, or any error yields null (no detail), so the
// surface shows a calm "pick a contact" prompt rather than another Space's data.
//
// SHAPE (mirrors lib/crm/client-notes.ts): no 'use server' directive, so the SERVER detail component
// imports the read straight from here. crm_* / network_* tables are not in the generated DB types yet,
// so the enrichment read goes through the untyped admin client (ADR-246).

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getContact, getDeals, type CrmDeal } from '@/lib/crm/pipeline'
import { listClientNotes, type ClientNote } from '@/lib/crm/client-notes'
import { listContactInteractions } from '@/lib/crm/interactions'
import { buildTimeline, type TimelineEntry } from '@/lib/crm/timeline'

/** The identity + enriched fields the detail header shows. name/email come from the Space contact row;
 *  phone/company/city are best-effort enrichment from a linked capture (null when none is known). */
export interface SpaceContactIdentity {
  id: string
  name: string | null
  email: string
  phone: string | null
  company: string | null
  city: string | null
  consentState: string
  createdAt: string | null
}

/** Everything the per-space contact detail surface renders for one contact. */
export interface SpaceContactDetail {
  identity: SpaceContactIdentity
  timeline: TimelineEntry[]
  deals: CrmDeal[]
  notes: ClientNote[]
}

/** Resolve the caller and confirm they may edit this Space (owner / admin / editor). Returns the
 *  caller's profile id when allowed, or null. Detail is owner data, so reads require this. */
async function requireSpaceEditor(spaceId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, profileId)
  return caps.canEditProfile ? profileId : null
}

/**
 * The full detail for one contact of one Space, or null when the caller may not see it (not an editor,
 * or the contact is not in this Space). Owner-gated + space-scoped end to end; fail-safe on every fold
 * (a failed enrichment / timeline read degrades to empty rather than throwing).
 */
export async function getSpaceContactDetail(
  spaceId: string,
  contactId: string,
): Promise<SpaceContactDetail | null> {
  const editorId = await requireSpaceEditor(spaceId)
  if (!editorId) return null

  // The contact must belong to THIS Space (no cross-space contact ids).
  const contact = await getContact(contactId, spaceId)
  if (!contact) return null

  // Fold the three sources in parallel; each is independently fail-safe.
  const [enrichment, interactions, notes, dealsAll] = await Promise.all([
    enrichFromCapture(contact.email),
    listContactInteractions({ subjectKind: 'contact', subjectId: contactId, spaceId, limit: 100 }),
    listClientNotes(spaceId, contactId),
    getDeals(spaceId),
  ])

  // The Space's private notes fold into the timeline as legacy notes (buildTimeline shapes + sorts).
  const timeline = buildTimeline({
    interactions,
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt })),
  })

  // Only this contact's deals (the per-space getDeals is already scoped to the Space).
  const deals = dealsAll.filter((d) => d.contact_id === contactId)

  const identity: SpaceContactIdentity = {
    id: contact.id,
    name: contact.display_name,
    email: contact.email,
    phone: enrichment.phone,
    company: enrichment.company,
    city: enrichment.city,
    consentState: contact.consent_state,
    createdAt: contact.created_at,
  }

  return { identity, timeline, deals, notes }
}

/** Best-effort phone/company/city for a contact from any `network_contacts` capture that shares its
 *  email (the person-stitch join by lowercased email, ADR-130). FAIL-SAFE: all-null on any miss/error.
 *  Picks the most recently captured non-null value for each field across the matching captures. */
async function enrichFromCapture(
  email: string,
): Promise<{ phone: string | null; company: string | null; city: string | null }> {
  const blank = { phone: null, company: null, city: null }
  const needle = (email ?? '').trim().toLowerCase()
  if (!needle) return blank
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          ilike: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
            }
          }
        }
      }
    }
    const { data, error } = await db
      .from('network_contacts')
      .select('phone, company, city, created_at')
      .ilike('email', needle)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error || !data) return blank
    const out = { ...blank } as { phone: string | null; company: string | null; city: string | null }
    for (const row of data) {
      // Rows are newest-first, so the first non-null value for each field wins (most recent capture).
      if (out.phone === null && typeof row.phone === 'string' && row.phone.trim()) out.phone = row.phone.trim()
      if (out.company === null && typeof row.company === 'string' && row.company.trim()) out.company = row.company.trim()
      if (out.city === null && typeof row.city === 'string' && row.city.trim()) out.city = row.city.trim()
    }
    return out
  } catch {
    return blank
  }
}
