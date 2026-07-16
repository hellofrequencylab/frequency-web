'use server'

// Guided-setup build actions (EMAIL-CAMPAIGNS-FUNNELS-PLAN P3, ask #3; CRM Phase 1). The "New" flow asks a
// few best-practice questions, then hands off to one of two builders:
//   • MANUAL  — seed the best-practice scaffold and open the working editor (unchanged): a funnel goal creates
//     a funnel (the four canonical stages) and opens the flow view; a campaign goal opens the composer.
//   • VERA    — the guided AI generator (lib/ai/messaging-generator): Vera drafts the actual email copy from
//     the answers and lands it in the SAME composer as a reviewable DRAFT. A campaign goal produces one draft
//     campaign; a sequence goal produces one draft per step. NOTHING is sent: each draft is a `campaigns` row
//     with status 'draft', edited + sent later through the existing gated pipeline. The generator never
//     enqueues mail.
//
// The gate is writerGate() (a staff web_role OR the marketing capability at write) — the SAME gate every
// email-studio draft write takes, and the same axis the page (requireAdmin admin/marketing) asserts. Copy is
// plain, no em dashes (voice).

import { getMessagingGoal } from '@/lib/messaging/goals'
import { createFunnel } from '@/app/(main)/admin/growth/funnels/actions'
import { writerGate } from '@/lib/beta/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateCampaignDraft,
  generateSequenceDraft,
  type GeneratedEmail,
  type GenerateMessagingInput,
} from '@/lib/ai/messaging-generator'
import { compileEmailDoc } from '@/lib/email-studio/shell'
import { ok, fail, type ActionResult } from '@/lib/action-result'

export interface StartBuildInput {
  goalKey: string
  name: string
  /** For a campaign: the audience segment key (stored on the draft + passed to the composer). */
  audience?: string
  /** A plain audience label for grounding the generator (e.g. "All members"). */
  audienceLabel?: string
  tone?: string
  /** Anything the operator added in their own words (grounds the Vera draft). */
  details?: string
  /** 'manual' builds the scaffold; 'vera' runs the AI generator. */
  mode: 'manual' | 'vera'
}

export interface StartBuildResult {
  href: string
  /** True when the caller asked for Vera but got the manual scaffold (AI was off / over budget / it failed). */
  veraPending: boolean
}

/**
 * Insert one DRAFT campaign from a generated email doc and return its id. Reuses the SAME `campaigns` draft
 * shape createEmailDraft writes (block_json is the body source of truth; `body` is a legacy NOT NULL column
 * seeded empty; status 'draft'), so the draft opens in the existing composer and rides the gated send later.
 * The cached compiled_html is best-effort so a preview is instant. NEVER sends.
 */
async function insertCampaignDraft(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  doc: GeneratedEmail,
  segment: string | null,
): Promise<string | null> {
  let compiledHtml: string | null = null
  try {
    compiledHtml = compileEmailDoc(doc).html
  } catch {
    /* compiled_html is a best-effort cache; a failure never blocks the draft */
  }
  const { data, error } = await db
    .from('campaigns')
    .insert({
      block_json: doc.layout as unknown as never,
      body: '',
      subject: doc.subject.slice(0, 300),
      preheader: doc.preheader.slice(0, 300),
      segment: segment ?? '',
      status: 'draft',
      created_by: profileId,
      ...(compiledHtml ? { compiled_html: compiledHtml } : {}),
    } as unknown as never)
    .select('id')
    .single()
  if (error || !data) return null
  return (data as { id: string }).id
}

/** Build the object for a goal and return where to send the operator next. */
export async function startBuild(input: StartBuildInput): Promise<ActionResult<StartBuildResult>> {
  const goal = getMessagingGoal(input.goalKey)
  if (!goal) return fail('Pick a goal first.')

  const name = input.name?.trim()
  if (!name) return fail('Give it a name.')

  // ── Vera path: the guided AI generator (CRM Phase 1) ──────────────────────────────────────────────────
  if (input.mode === 'vera') {
    const gate = await writerGate()
    if (!gate.ok) return fail(gate.error)

    const genInput: GenerateMessagingInput = {
      goalKey: goal.key,
      goalLabel: goal.label,
      object: goal.object,
      intent: goal.blurb,
      audience: input.audienceLabel?.trim() || 'Frequency members',
      tone: input.tone ?? 'warm',
      name,
      details: input.details?.trim() || undefined,
      outline: goal.outline,
      stepCount: goal.outline?.length,
      profileId: gate.profileId,
    }

    const db = createAdminClient()

    if (goal.object === 'campaign') {
      const email = await generateCampaignDraft(genInput)
      // AI off / over budget / model failure → fall back to the manual scaffold, flagged so the UI can say so.
      if (!email) return startManual(goal, name, input)
      const id = await insertCampaignDraft(db, gate.profileId, email, input.audience ?? null)
      if (!id) return fail('Vera drafted your email, but we could not save it. Try again.')
      return ok({ href: `/admin/crm/marketing?open=${id}`, veraPending: false })
    }

    // A sequence goal: draft every step, then persist each as its own reviewable draft (no delay column on
    // campaigns; the operator wires cadence in the funnel builder). They land in the CRM Marketing list.
    const sequence = await generateSequenceDraft(genInput)
    if (!sequence || sequence.steps.length === 0) return startManual(goal, name, input)
    let saved = 0
    for (const step of sequence.steps) {
      const id = await insertCampaignDraft(db, gate.profileId, step, null)
      if (id) saved++
    }
    if (saved === 0) return fail('Vera drafted your series, but we could not save it. Try again.')
    return ok({ href: '/admin/crm/marketing', veraPending: false })
  }

  // ── Manual path (unchanged) ───────────────────────────────────────────────────────────────────────────
  return startManual(goal, name, input)
}

/** The manual (non-AI) scaffold + routing, shared by the manual mode AND the Vera fallback when AI is off. */
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

  // Campaign goal: the composer is the working author surface. Carry the audience as a hint so the composer
  // can preselect it (a query the composer reads; harmless if not).
  const params = new URLSearchParams()
  if (input.audience) params.set('segment', input.audience)
  const query = params.toString()
  return ok({ href: `/admin/crm/marketing${query ? `?${query}` : ''}`, veraPending })
}
