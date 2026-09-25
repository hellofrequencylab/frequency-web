import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureSpaceStages, getFirstOpenStage } from '@/lib/crm/pipeline'
import type { SpaceType } from '@/lib/spaces/types'

// A PIPELINE DEAL FOR ONE CAPTURED LEAD.
//
// WHY THIS MODULE EXISTS. Every lead-grab door seals a contact and stops there, so a captured lead
// shows up in the Space CRM's PEOPLE view and nowhere else; the Pipeline board stays empty. The only
// code in the repo that ever inserted a deal was the bulk graduation importer
// (lib/crm/graduation.ts) and the platform-root admin board (which does not even stamp space_id, so
// it is not reusable for a Space). "Put this lead on the pipeline" had no single-contact form. This
// is it, lifted from the graduation importer's own insert so the two cannot drift.
//
// authz-delegated: this helper intentionally trusts its caller, and the gate lives at the call site.
// It is reachable from exactly one place, the public contact-form action
// (app/(main)/spaces/[slug]/contact-form-actions.ts), whose own `authz-ok` block explains the guard:
// the Space is resolved SERVER-SIDE from the page's slug with an anonymous viewer (a private Space
// fails closed) and is never accepted as an id from the client. By the time a spaceId reaches this
// function it has already been proven to name a publicly visible Space. Every write below is stamped
// with that space_id, so the deal lands in the resolved Space's pipeline and nowhere else. There is
// no caller-supplied scope left for this function to re-check. (ADR-274 / ADR-275.)
//
// EVERYTHING HERE IS BEST-EFFORT AND FAIL-SAFE. A deal is a convenience on top of a contact that is
// already sealed: if this throws, the lead is still captured, still in People, still claimable. It
// must never be the thing that loses a lead, so every path returns null rather than raising.

type Loose = {
  from: (t: string) => {
    insert: (rows: Record<string, unknown>[]) => {
      select: (cols: string) => { maybeSingle: () => Promise<{ data: { id: string } | null }> }
    }
  }
}

export interface LeadDealInput {
  spaceId: string
  contactId: string
  /** The Space's type + Focus, so a first-ever deal seeds the right Mode preset stages. */
  spaceType?: SpaceType | null
  modeVariant?: string | null
  /** What the card is called. Falls back to the contact's name, then the email. */
  displayName?: string | null
  email?: string | null
  /** Where the deal came from, e.g. `lead_contact_form`. */
  source?: string | null
}

/**
 * Put a captured lead on the Space's pipeline: seed the Mode-preset stages if the Space has none,
 * then insert ONE open deal in the first open stage. Returns the deal id, or null when anything at
 * all goes wrong (including a Space whose pipeline cannot be seeded).
 *
 * `status` is ALWAYS 'open', never the stage's own kind. `getFirstOpenStage` falls back to stages[0]
 * when a pipeline has no open stage at all, and that stage's kind could be won or lost — using it as
 * the status would mint a deal that is born closed. This is the graduation importer's own reasoning
 * and it is repeated here because it is the kind of thing that looks like a simplification.
 */
export async function createDealForCapturedLead(input: LeadDealInput): Promise<string | null> {
  const spaceId = (input.spaceId ?? '').trim()
  const contactId = (input.contactId ?? '').trim()
  if (!spaceId || !contactId) return null
  try {
    // Idempotent + a no-op the moment the Space has ANY stage, so an operator who has customised
    // their pipeline is never overwritten by an inbound lead.
    await ensureSpaceStages(spaceId, input.spaceType ?? null, input.modeVariant ?? null)
    const firstOpen = await getFirstOpenStage(spaceId)

    const name = (input.displayName ?? '').trim()
    const email = (input.email ?? '').trim()
    // A deal card must always render something, so the title degrades name -> email -> a neutral
    // label rather than ever being empty (title is NOT NULL on crm_deals).
    const title = name || email || 'Contact form enquiry'

    const { data } = await (createAdminClient() as unknown as Loose)
      .from('crm_deals')
      .insert([
        {
          space_id: spaceId,
          title,
          // Denormalised on purpose (the column exists for this): the board renders a card without
          // joining contacts, so a deleted contact still leaves a legible card.
          contact_name: name || null,
          contact_id: contactId,
          stage_id: firstOpen?.id ?? null,
          status: 'open',
          source: input.source ?? null,
        },
      ])
      .select('id')
      .maybeSingle()
    return data?.id ?? null
  } catch {
    // The contact is sealed either way; the deal is the best-effort half.
    return null
  }
}
