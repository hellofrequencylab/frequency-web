'use server'

// Guided setup: Vera reviews the plan without persisting model output. Only an explicit
// manual continuation creates a draft from the author's inputs. Sending remains separately gated.

import { getMessagingGoal } from '@/lib/messaging/goals'
import { createFunnel } from '@/app/(main)/admin/growth/funnels/actions'
import { writerGate } from '@/lib/outbound/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { coachMessaging, type MessagingCoaching } from '@/lib/ai/messaging-generator'
import { ok, fail, type ActionResult } from '@/lib/action-result'

export interface StartBuildInput {
  goalKey: string
  name: string
  /** For a campaign: the audience segment key (stored on the draft + passed to the composer). */
  audience?: string
  /** A plain audience label for grounding the generator (e.g. "All members"). */
  audienceLabel?: string
  tone?: string
  /** Anything the operator added in their own words (grounds coaching). */
  details?: string
  /** 'manual' creates the author-controlled scaffold; 'vera' returns coaching only. */
  mode: 'manual' | 'vera'
}

export interface StartBuildResult {
  href: string
  /** Legacy response field; coaching never silently falls back to creating a draft. */
  veraPending: boolean
  coaching?: MessagingCoaching
}

/**
 * Insert one DRAFT campaign for the MANUAL campaign path (no generated body). Mirrors insertCampaignDraft's
 * `campaigns` draft shape (block_json is the body source of truth — an empty layout here; `body` is a legacy
 * NOT NULL column seeded empty; status 'draft'), carrying the operator's own inputs so nothing they typed is
 * lost: the name becomes the working subject, the audience becomes the segment, and their free-text notes ride
 * along in the preheader (a spot they can move in the composer). The draft opens in the composer via ?open=<id>
 * and rides the existing gated send later. NEVER sends.
 */
async function insertManualCampaignDraft(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  opts: { name: string; segment: string | null; details?: string },
): Promise<string | null> {
  const { data, error } = await db
    .from('campaigns')
    .insert({
      block_json: { rows: [] } as unknown as never,
      body: '',
      subject: opts.name.slice(0, 300),
      preheader: (opts.details ?? '').slice(0, 300),
      segment: opts.segment ?? '',
      status: 'draft',
      created_by: profileId,
    } as unknown as never)
    .select('id')
    .single()
  if (error || !data) return null
  return (data as { id: string }).id
}

// authz-ok: every branch gates, which the branch-position rule (R2) cannot see — the Vera path
// and the manual campaign path both open with writerGate() (enforced via `if (!gate.ok) return`),
// and the manual funnel path delegates to createFunnel, which self-gates with requireMarketer
// inside app/(main)/admin/growth/funnels/actions.ts. No path touches the admin client ungated.
/** Build the object for a goal and return where to send the operator next. */
export async function startBuild(input: StartBuildInput): Promise<ActionResult<StartBuildResult>> {
  const goal = getMessagingGoal(input.goalKey)
  if (!goal) return fail('Pick a goal first.')

  const name = input.name?.trim()
  if (!name) return fail('Give it a name.')

  // ── Coaching path: no draft writes ──────────────────────────────────────────────────
  if (input.mode === 'vera') {
    const gate = await writerGate()
    if (!gate.ok) return fail(gate.error)
    const coaching = await coachMessaging({ goalKey: goal.key, goalLabel: goal.label,
      object: goal.object, intent: goal.blurb, audience: input.audienceLabel?.trim() || 'Frequency members',
      tone: input.tone ?? 'warm', name, details: input.details, outline: goal.outline, profileId: gate.profileId })
    if (!coaching) return fail('Vera could not review your plan right now. You can still continue with your own words.')
    return ok({ href: '', veraPending: false, coaching })
  }

  return startManual(goal, name, input)
}

/** Explicit manual scaffold and routing. AI failure never invokes this path. */
async function startManual(
  goal: NonNullable<ReturnType<typeof getMessagingGoal>>,
  name: string,
  input: StartBuildInput,
): Promise<ActionResult<StartBuildResult>> {
  const veraPending = input.mode === 'vera'

  if (goal.object === 'funnel') {
    const res = await createFunnel({ name, description: goal.blurb, goalEvent: goal.goalEvent })
    if ('error' in res) return fail(res.error)
    return ok({ href: `/admin/marketing/messaging/funnels/${res.data.id}`, veraPending })
  }

  // Campaign goal: mint a real draft carrying the operator's inputs, then open it in the composer via
  // ?open=<id>. The CRM Marketing page reads ONLY ?open= (?segment= dead-ends — no draft, inputs lost), so
  // this mirrors the sibling paths: manual funnel createFunnel+opens, Vera campaign insertCampaignDraft+opens.
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const db = createAdminClient()
  const id = await insertManualCampaignDraft(db, gate.profileId, {
    name,
    segment: input.audience ?? null,
    details: input.details?.trim() || undefined,
  })
  if (!id) return fail('Could not start your draft. Try again.')
  return ok({ href: `/admin/crm/marketing?open=${id}`, veraPending })
}
