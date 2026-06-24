'use server'

// Circle Templates admin actions (Starter Circles, Stage 3). Operator-facing name is
// "Circle Templates"; the member-facing surface is "Starter Circles". Every mutation
// gates explicitly — host+ on the community ladder OR the 'community' staff domain
// (ADR-127), re-checked server-side (a Server Action is a public POST endpoint; the
// client never carries authority). Writes go through the service-role admin client.
//
// circle_templates is net-new and absent from the generated DB types until its
// migration is applied + types regenerated — the "genuinely untyped" case ADR-246's
// lint rule sanctions. We drop to an untyped handle for those writes, exactly as
// lib/circles/templates-data.ts does for its reads. platform_flags IS in the generated
// types, so its upsert routes through the typed setPlatformFlag helper.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { setPlatformFlag } from '@/lib/platform-flags'
import { logAdminAction } from '@/lib/admin/audit'
import { CIRCLE_TEMPLATES_FLAG, type CalloutAnchor } from '@/lib/circles/templates'
import type { PillarSlug } from '@/lib/pillars'

// circle_templates is not in the generated DB types pre-apply (see file header).
function db(): SupabaseClient {
  // eslint-disable-next-line no-restricted-syntax -- table not in generated types pre-apply (see header)
  return createAdminClient() as unknown as SupabaseClient
}

const PILLARS: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']
const CALLOUT_ANCHORS: readonly CalloutAnchor[] = [
  'identity',
  'card',
  'pillars',
  'rhythm',
  'meetup',
  'gathering',
  'agreements',
  'size',
  'remix',
  'launch',
]

async function requireOperator() {
  return authorizeAction(await getCallerProfile(), 'host', 'community')
}

// --- Parsing helpers (defensive: the client is never trusted) -------------------

function str(fd: FormData, key: string): string {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/** A trimmed string, or null when blank — for the nullable columns. */
function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  return v || null
}

/** One string per line, blanks dropped — the array editors (agreements, remix). */
function lines(fd: FormData, key: string): string[] {
  const v = fd.get(key)
  if (typeof v !== 'string') return []
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function asPillarOrNull(v: string): PillarSlug | null {
  return (PILLARS as readonly string[]).includes(v) ? (v as PillarSlug) : null
}

// --- Per-template active toggle -------------------------------------------------

/** Flip one template's per-template `is_active` switch. */
export async function setTemplateActive(id: string, active: boolean): Promise<ActionResult> {
  let actorId: string
  try {
    actorId = (await requireOperator()).id
  } catch {
    return fail('You need operator access for this.')
  }
  const { error } = await db()
    .from('circle_templates')
    .update({ is_active: active })
    .eq('id', id)
  if (error) return fail(error.message)
  await logAdminAction({
    actorId,
    action: 'circle_template.active',
    targetType: 'circle_template',
    targetId: id,
    detail: { is_active: active },
  })
  revalidatePath('/admin/circle-templates')
  return ok()
}

// --- Global master switch -------------------------------------------------------

/** Flip the global master switch (platform_flags 'circle_templates_enabled') that gates
 *  the whole member-facing Starter Circles surface. Off by default. */
export async function setTemplatesEnabled(enabled: boolean): Promise<ActionResult> {
  let actorId: string
  try {
    actorId = (await requireOperator()).id
  } catch {
    return fail('You need operator access for this.')
  }
  try {
    await setPlatformFlag(CIRCLE_TEMPLATES_FLAG, enabled, { changedBy: actorId, source: 'admin' })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not change the master switch.')
  }
  revalidatePath('/admin/circle-templates')
  return ok()
}

// --- Reorder --------------------------------------------------------------------

/** Move a template up or down by swapping `display_order` with its neighbor. */
export async function reorderTemplate(id: string, direction: 'up' | 'down'): Promise<ActionResult> {
  try {
    await requireOperator()
  } catch {
    return fail('You need operator access for this.')
  }
  const client = db()
  const { data: rows } = await client
    .from('circle_templates')
    .select('id, display_order')
    .order('display_order', { ascending: true })
  const list = (rows ?? []) as { id: string; display_order: number }[]
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return fail('That template no longer exists.')
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= list.length) return ok() // already at the edge
  const self = list[idx]
  const neighbor = list[swapIdx]
  // Swap the two display_order values.
  const { error: e1 } = await client
    .from('circle_templates')
    .update({ display_order: neighbor.display_order })
    .eq('id', self.id)
  if (e1) return fail(e1.message)
  const { error: e2 } = await client
    .from('circle_templates')
    .update({ display_order: self.display_order })
    .eq('id', neighbor.id)
  if (e2) return fail(e2.message)
  revalidatePath('/admin/circle-templates')
  return ok()
}

// --- Full edit ------------------------------------------------------------------

/**
 * Write every editable field of a template from the editor form. Typed columns parse
 * straight off the FormData; the jsonb structures (pillars_inside, meetup, gathering,
 * agreements, remix_options, callouts) are re-shaped here, never trusted raw. The DB
 * trigger maintains `updated_at`; `display_order` and `is_active` are owned by the
 * reorder / toggle controls, not this form.
 */
export async function updateTemplate(id: string, fd: FormData): Promise<ActionResult> {
  let actorId: string
  try {
    actorId = (await requireOperator()).id
  } catch {
    return fail('You need operator access for this.')
  }

  const name = str(fd, 'name')
  if (!name) return fail('Give the template a name.')
  const slug = str(fd, 'slug')
  if (!slug) return fail('The template needs a slug.')

  const primaryPillar = asPillarOrNull(str(fd, 'primary_pillar'))
  if (!primaryPillar) return fail('Pick a primary Pillar.')

  const identity = str(fd, 'identity')
  if (!identity) return fail('Identity is required.')
  const audience = str(fd, 'audience')
  if (!audience) return fail('Audience is required.')
  const card = str(fd, 'card')
  if (!card) return fail('The Card hook is required.')
  const oneLiner = str(fd, 'one_liner')
  if (!oneLiner) return fail('The one-liner is required.')

  // pillars_inside: one line each for the four Pillars (the primary lean included).
  const pillarsInside: Record<string, string> = {}
  for (const p of PILLARS) {
    const line = str(fd, `pillars_inside.${p}`)
    if (line) pillarsInside[p] = line
  }

  // meetup / gathering: { text, length } / { text }.
  const meetup: { text: string; length?: string } = { text: str(fd, 'meetup.text') }
  const meetupLength = str(fd, 'meetup.length')
  if (meetupLength) meetup.length = meetupLength
  const gathering: { text: string } = { text: str(fd, 'gathering.text') }

  // callouts: a parallel set of anchor/title/body rows, kept only when title + body present.
  const callouts: { anchor: CalloutAnchor; title: string; body: string }[] = []
  const calloutCount = Math.min(20, Number(fd.get('callout_count')) || 0)
  for (let i = 0; i < calloutCount; i++) {
    const title = str(fd, `callout.${i}.title`)
    const body = str(fd, `callout.${i}.body`)
    if (!title || !body) continue
    const rawAnchor = str(fd, `callout.${i}.anchor`)
    const anchor = (CALLOUT_ANCHORS as readonly string[]).includes(rawAnchor)
      ? (rawAnchor as CalloutAnchor)
      : 'launch'
    callouts.push({ anchor, title, body })
  }

  const update = {
    name,
    slug,
    primary_pillar: primaryPillar,
    identity,
    audience,
    card,
    one_liner: oneLiner,
    about: strOrNull(fd, 'about'),
    pillars_inside: pillarsInside,
    meetup,
    gathering,
    thread: strOrNull(fd, 'thread'),
    format: strOrNull(fd, 'format'),
    size_label: strOrNull(fd, 'size_label'),
    agreements: lines(fd, 'agreements'),
    recommended_journey_pillar: asPillarOrNull(str(fd, 'recommended_journey_pillar')),
    remix_options: lines(fd, 'remix_options'),
    callouts,
    image_url: strOrNull(fd, 'image_url'),
  }

  const { error } = await db().from('circle_templates').update(update).eq('id', id)
  if (error) return fail(error.message)

  await logAdminAction({
    actorId,
    action: 'circle_template.update',
    targetType: 'circle_template',
    targetId: id,
    detail: { slug },
  })
  revalidatePath('/admin/circle-templates')
  revalidatePath(`/admin/circle-templates/${slug}`)
  return ok()
}
