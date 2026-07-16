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
import { getSpaceCapabilities, autoExecutionAllowed } from '@/lib/spaces/entitlements'
import { getContact, getDeals, type CrmDeal } from '@/lib/crm/pipeline'
import { listClientNotes, type ClientNote } from '@/lib/crm/client-notes'
import { listContactInteractions } from '@/lib/crm/interactions'
import { buildTimeline, type TimelineEntry } from '@/lib/crm/timeline'
import { getMemberScores, type MemberScores } from '@/lib/dashboard/scores'
import { draftContextLine, explainMemberScores, type ScoreReadout } from '@/lib/dashboard/person-band'
import { getMemberContext, type MemberFacts } from '@/lib/ai/memory'
import { resolvePlaybookForScores } from '@/lib/playbooks/resolve'
import { effectiveAutonomyTier, type AutonomyTier } from '@/lib/playbooks/registry'
import { listSpaceCustomFields } from '@/lib/crm/import/store'
import { humanizeFieldKey } from '@/lib/crm/import/custom-fields'
import type { ValueType } from '@/lib/crm/import/types'

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
  /** Imported custom fields (from `contacts.meta.custom`), each resolved against the Space's custom
   *  -field registry for its human label + value type (so the card can format a date, dial a phone,
   *  link a url). An unknown key still shows, with a label humanized from the key + a text type, so
   *  imported data is never hidden. Empty when the contact carries none. */
  customFields: { key: string; label: string; value: string; valueType: ValueType }[]
}

/** The Altitude 3 "where this person is" band + shared scores for the detail header. All fail-safe:
 *  a contact with no stitched member profile (a pure lead) carries no scores, so `hasScores` is false
 *  and the band reads the calm "not scored yet" line. */
export interface SpaceContactInsight {
  /** The member profile behind this contact (the score / matches / facts key), or null for a lead. */
  profileId: string | null
  /** The shared scores (Resonance Health + churn + activation + lifecycle), null fields when unscored. */
  scores: MemberScores
  /** True when the matview has scored this member (drives whether the score row renders). */
  hasScores: boolean
  /** The one-line "where this person is" brief, in voice (deterministic fallback, never throws). */
  contextLine: string
  /** The plain "top signals" + confidence band behind the scores (a bare score is never shown). */
  readout: ScoreReadout
  /** The member's confirmed facts (interests, goals, neighborhood) for the About panel, when any. */
  facts: MemberFacts | null
  /** The one-tap next-best-action play for this member (Altitude 3 picker), or null when there is
   *  nothing worth surfacing (a steady member, or a pure lead with no scores). The autonomy tier is
   *  the EFFECTIVE tier after this Space's slider, so the badge reads the same as the worklist. */
  nextBestPlay: SpaceContactPlay | null
}

/** The next-best-action play offered on the Space contact detail picker. Resolved server-side from the
 *  member's scores (the registry resolver), with the Space's effective autonomy tier baked in. */
export interface SpaceContactPlay {
  /** The registry playbook id the picker runs. */
  playbookId: string
  /** The operator-facing playbook name. */
  playbookName: string
  /** One plain line: what this play is for + why now (the registry rationale). */
  rationale: string
  /** The EFFECTIVE autonomy tier after the per-Space slider (auto -> suggest when suggest_only). */
  autonomyTier: AutonomyTier
  /** True when the primary action is outbound (the operator may Tweak the draft; it never auto-sends). */
  isOutbound: boolean
}

/** Everything the per-space contact detail surface renders for one contact. */
export interface SpaceContactDetail {
  identity: SpaceContactIdentity
  timeline: TimelineEntry[]
  deals: CrmDeal[]
  notes: ClientNote[]
  /** Altitude 3: the resonance/health insight band + About facts (fail-safe, member-only). */
  insight: SpaceContactInsight
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

  // Fold the sources in parallel; each is independently fail-safe. The contact's member profile id
  // (the score / matches / facts key) is resolved off the contact row, null for a pure lead. The
  // Space's custom-field registry labels + types this contact's meta.custom (fail-safe to []).
  const [enrichment, interactions, notes, dealsAll, profileId, registry] = await Promise.all([
    enrichFromCapture(contact.email),
    listContactInteractions({ subjectKind: 'contact', subjectId: contactId, spaceId, limit: 100 }),
    listClientNotes(spaceId, contactId),
    getDeals(spaceId),
    resolveContactProfileId(contactId),
    listSpaceCustomFields(spaceId),
  ])
  const registryByKey = new Map(registry.map((f) => [f.key, f]))

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
    customFields: Object.entries(contact.custom ?? {}).map(([key, value]) => {
      const def = registryByKey.get(key)
      return {
        key,
        label: def?.label || humanizeFieldKey(key),
        value,
        valueType: def?.valueType ?? 'text',
      }
    }),
  }

  // The Space's effective autonomy allowance sets the picker's EFFECTIVE tier (fail-closed to
  // suggest_only when the read misses), so the badge reads the same as the worklist + Today.
  const space = await getSpaceById(spaceId)
  const autoAllowed = autoExecutionAllowed(space)

  const insight = await buildInsight(
    profileId,
    contact.display_name || contact.email.split('@')[0] || 'This person',
    autoAllowed,
  )

  return { identity, timeline, deals, notes, insight }
}

/** The member profile id behind a Space contact (the score / matches / facts key), or null for a
 *  pure lead with no stitched profile. FAIL-SAFE: null on any error. */
async function resolveContactProfileId(contactId: string): Promise<string | null> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { profile_id: string | null } | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await db.from('contacts').select('profile_id').eq('id', contactId).maybeSingle()
    if (error || !data) return null
    return data.profile_id ?? null
  } catch {
    return null
  }
}

/** Assemble the Altitude 3 insight band: the shared scores, the "where this person is" line, the
 *  plain "why" readout, and the member's confirmed facts. FAIL-SAFE end to end: a lead (no profile)
 *  or any read error yields a calm "not scored yet" band with no facts. */
async function buildInsight(
  profileId: string | null,
  name: string,
  autoAllowed: boolean,
): Promise<SpaceContactInsight> {
  // A pure lead has no member profile, so no scores / matches / facts to read.
  const scores = await getMemberScores(profileId)
  const hasScores = scores.resonanceTier != null || scores.lifecycleStage != null
  const readout = explainMemberScores(scores)
  // The context line drafts from the standing (deterministic fallback, never throws). Facts come from
  // Vera's per-member memory, member-only and best-effort.
  const [contextLine, context] = await Promise.all([
    draftContextLine(name.trim(), scores),
    profileId ? getMemberContext(profileId) : Promise.resolve(null),
  ])
  const facts = context?.facts && hasAnyFact(context.facts) ? context.facts : null

  // The one-tap next-best-action play (Altitude 3 picker). Resolved PURELY from the scores via the
  // shared registry resolver (the same choice the worklist + Today make), with this Space's effective
  // autonomy tier baked into the badge. Null for a pure lead (no profile) or a steady member.
  const nextBestPlay: SpaceContactPlay | null = (() => {
    if (!profileId) return null
    const playbook = resolvePlaybookForScores(scores)
    if (!playbook) return null
    const primary = playbook.actions[0]
    return {
      playbookId: playbook.id,
      playbookName: playbook.name,
      rationale: playbook.rationale,
      autonomyTier: effectiveAutonomyTier(playbook.autonomyTier, autoAllowed),
      isOutbound: primary?.surface === 'outbound',
    }
  })()

  return { profileId, scores, hasScores, contextLine, readout, facts, nextBestPlay }
}

/** True when a facts record carries at least one usable value (so an empty {} hides the About panel). */
function hasAnyFact(f: MemberFacts): boolean {
  return Boolean(
    (f.interests && f.interests.length > 0) ||
      (f.goals && f.goals.length > 0) ||
      (f.constraints && f.constraints.length > 0) ||
      (f.neighborhood && f.neighborhood.trim()),
  )
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
