// Starter Circles — the builder DRAFT layer: load + save the editable Circle a
// Host owns (the `circles` row joined with its 1:1 `circle_profiles` companion),
// and create a brand-new draft from scratch or from a Vera spark. Server-only
// (admin client; the action layer enforces authz). Mirrors lib/circles/remix.ts
// (the Remix lifecycle) and lib/circles/templates-data.ts (the untyped handle for
// the net-new tables). Coercion is defensive: jsonb is re-shaped, never trusted.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'
import type { PillarSlug } from '@/lib/pillars'
import type {
  CircleCallout,
  CircleRhythm,
  PillarsInside,
  CalloutAnchor,
} from './templates'
import type { CircleSparkDraft } from '@/lib/ai/circle-spark'
import { stampCircleSpaceId } from './store'
import { ensureHostOnOwnership } from './remix'

// circle_profiles is a net-new table, absent from the generated DB types until
// its migration is applied and types are regenerated. This is the "genuinely
// untyped" case the ADR-246 lint rule sanctions; drop the handle and use the
// typed client once the table lands in the generated types (mirrors
// lib/circles/templates-data.ts).
function db(): SupabaseClient {
  // eslint-disable-next-line no-restricted-syntax -- table not in generated types pre-apply (see note above)
  return createAdminClient() as unknown as SupabaseClient
}

const PILLARS: readonly PillarSlug[] = ['mind', 'body', 'spirit', 'expression']

function asPillar(v: unknown): PillarSlug | null {
  return typeof v === 'string' && (PILLARS as readonly string[]).includes(v) ? (v as PillarSlug) : null
}
function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function asRhythm(v: unknown): CircleRhythm {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  return { text: typeof o.text === 'string' ? o.text : '', length: typeof o.length === 'string' ? o.length : undefined }
}
function asPillarsInside(v: unknown): PillarsInside {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const out: PillarsInside = {}
  for (const p of PILLARS) if (typeof o[p] === 'string') out[p] = o[p] as string
  return out
}
function asCallouts(v: unknown): CircleCallout[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((c) => {
    if (!c || typeof c !== 'object') return []
    const o = c as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title : ''
    const body = typeof o.body === 'string' ? o.body : ''
    const anchor = (typeof o.anchor === 'string' ? o.anchor : 'launch') as CalloutAnchor
    return title && body ? [{ anchor, title, body }] : []
  })
}

/** The editable Circle as the builder sees it: the `circles` framework fields +
 *  the rich `circle_profiles` content, merged into one flat draft. */
export interface CircleDraft {
  circleId: string
  slug: string
  name: string
  about: string | null
  type: 'in-person' | 'online'
  memberCap: number
  status: string
  hostId: string | null
  primaryPillar: PillarSlug | null
  pillarsInside: PillarsInside
  meetup: CircleRhythm
  gathering: CircleRhythm
  thread: string | null
  format: string | null
  sizeLabel: string | null
  agreements: string[]
  recommendedJourneyPillar: PillarSlug | null
  remixOptions: string[]
  editorNotes: CircleCallout[]
}

/** The fields a save may touch. Only keys present are written; the rest are
 *  left untouched (autosave sends just what changed). */
export type CircleDraftPatch = Partial<
  Pick<
    CircleDraft,
    | 'name'
    | 'about'
    | 'type'
    | 'memberCap'
    | 'primaryPillar'
    | 'pillarsInside'
    | 'meetup'
    | 'gathering'
    | 'thread'
    | 'format'
    | 'sizeLabel'
    | 'agreements'
    | 'remixOptions'
    | 'recommendedJourneyPillar'
  >
>

/** Load the draft: the `circles` row (typed) + its `circle_profiles` companion
 *  (untyped handle). Returns null if the circle is missing. */
export async function getCircleDraft(circleId: string): Promise<CircleDraft | null> {
  const admin = createAdminClient()
  // Typed read of the framework columns. primary_pillar is newer than the
  // generated types, so it is read through the untyped handle below (ADR-246),
  // alongside the net-new circle_profiles row.
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, name, about, type, member_cap, status, host_id')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) return null
  const c = circle as Record<string, unknown>

  const { data: pillarRow } = await db()
    .from('circles')
    .select('primary_pillar')
    .eq('id', circleId)
    .maybeSingle()

  const { data: profileRow } = await db()
    .from('circle_profiles')
    .select(
      'pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, editor_notes',
    )
    .eq('circle_id', circleId)
    .maybeSingle()
  const p = (profileRow ?? {}) as Record<string, unknown>

  return {
    circleId: String(c.id),
    slug: String(c.slug),
    name: String(c.name ?? ''),
    about: c.about == null ? null : String(c.about),
    type: c.type === 'online' ? 'online' : 'in-person',
    memberCap: typeof c.member_cap === 'number' ? c.member_cap : 12,
    status: String(c.status ?? 'draft'),
    hostId: c.host_id == null ? null : String(c.host_id),
    primaryPillar: asPillar((pillarRow as Record<string, unknown> | null)?.primary_pillar),
    pillarsInside: asPillarsInside(p.pillars_inside),
    meetup: asRhythm(p.meetup),
    gathering: asRhythm(p.gathering),
    thread: p.thread == null ? null : String(p.thread),
    format: p.format == null ? null : String(p.format),
    sizeLabel: p.size_label == null ? null : String(p.size_label),
    agreements: asStrArray(p.agreements),
    recommendedJourneyPillar: asPillar(p.recommended_journey_pillar),
    remixOptions: asStrArray(p.remix_options),
    editorNotes: asCallouts(p.editor_notes),
  }
}

/** Apply a patch: framework fields go to `circles` (cast the payload, like
 *  remix.ts), the rich content upserts onto `circle_profiles` (untyped handle).
 *  Only keys present in the patch are written. */
export async function saveCircleDraft(circleId: string, patch: CircleDraftPatch): Promise<void> {
  const admin = createAdminClient()

  // Framework fields on the hot `circles` table. primary_pillar isn't in the
  // generated types yet, so cast the payload (ADR-246), exactly like remix.ts.
  const circleUpdate: Record<string, unknown> = {}
  if ('name' in patch) circleUpdate.name = patch.name
  if ('about' in patch) circleUpdate.about = patch.about
  if ('type' in patch) circleUpdate.type = patch.type
  if ('memberCap' in patch) circleUpdate.member_cap = patch.memberCap
  if ('primaryPillar' in patch) circleUpdate.primary_pillar = patch.primaryPillar
  if (Object.keys(circleUpdate).length) {
    await admin.from('circles').update(circleUpdate as never).eq('id', circleId)
  }

  // Rich content on the 1:1 `circle_profiles` companion (net-new table, untyped
  // handle). Upsert on circle_id so the row is created if it does not exist yet.
  const profileUpdate: Record<string, unknown> = {}
  if ('pillarsInside' in patch) profileUpdate.pillars_inside = patch.pillarsInside
  if ('meetup' in patch) profileUpdate.meetup = patch.meetup
  if ('gathering' in patch) profileUpdate.gathering = patch.gathering
  if ('thread' in patch) profileUpdate.thread = patch.thread
  if ('format' in patch) profileUpdate.format = patch.format
  if ('sizeLabel' in patch) profileUpdate.size_label = patch.sizeLabel
  if ('agreements' in patch) profileUpdate.agreements = patch.agreements
  if ('remixOptions' in patch) profileUpdate.remix_options = patch.remixOptions
  if ('recommendedJourneyPillar' in patch) profileUpdate.recommended_journey_pillar = patch.recommendedJourneyPillar
  if (Object.keys(profileUpdate).length) {
    await db()
      .from('circle_profiles')
      .upsert({ circle_id: circleId, ...profileUpdate }, { onConflict: 'circle_id' })
  }
}

async function uniqueCircleSlug(admin: ReturnType<typeof createAdminClient>, base: string): Promise<string> {
  let slug = slugify(base) || 'circle'
  const { data } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (data) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`
  return slug
}

/** Pick a starting member_cap from a free-text size label ("5 to 10"): the
 *  largest number stated, clamped. Mirrors capFromSize in remix.ts. */
function capFromSize(label: string | null | undefined): number {
  if (!label) return 12
  const nums = label.match(/\d+/g)
  const max = nums && nums.length ? Math.max(...nums.map(Number)) : 12
  return Math.min(50, Math.max(2, max || 12))
}

/** Create a brand-new draft Circle the caller owns: from a Vera spark, or empty.
 *  Mirrors remixTemplate (insert circles + circle_profiles, upsert host
 *  membership, elevate to Host), but with no origin template. */
export async function createBlankCircleDraft(input: {
  profileId: string
  name?: string
  spark?: CircleSparkDraft
}): Promise<{ circleId: string; slug: string }> {
  const admin = createAdminClient()
  const spark = input.spark
  const name = (input.name?.trim() || spark?.name?.trim() || 'New circle').slice(0, 120)
  const slug = await uniqueCircleSlug(admin, name)
  const spaceId = await stampCircleSpaceId()

  // The draft Circle: owned by the caller, status 'draft' so it is hidden from
  // discovery until they publish. Default in-person. space_id + status 'draft' +
  // primary_pillar are newer than the generated DB types, so cast the payload
  // (ADR-246), exactly like remixTemplate. No origin_template_id (built fresh).
  const about = spark ? (spark.oneLiner || spark.identity || null) : null
  const { data: circle, error } = await admin
    .from('circles')
    .insert({
      name,
      about,
      type: 'in-person',
      member_cap: capFromSize(spark?.sizeLabel),
      status: 'draft',
      slug,
      host_id: input.profileId,
      member_count: 0,
      ...(spark?.primaryPillar ? { primary_pillar: spark.primaryPillar } : {}),
      ...(spaceId ? { space_id: spaceId } : {}),
    } as never)
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const circleId = String((circle as { id: string }).id)

  // The rich content travels into the 1:1 profile. From the spark's fields when
  // given (the spark's meetup/gathering/thread/format are plain strings; reshape
  // the two rhythm beats into { text }), else empty defaults. circle_profiles is
  // a net-new table, absent from the generated types (untyped handle, ADR-246).
  await db().from('circle_profiles').insert({
    circle_id: circleId,
    pillars_inside: spark?.pillarsInside ?? {},
    meetup: spark?.meetup ? { text: spark.meetup } : { text: '' },
    gathering: spark?.gathering ? { text: spark.gathering } : { text: '' },
    thread: spark?.thread || null,
    format: spark?.format || null,
    size_label: spark?.sizeLabel || null,
    agreements: spark?.agreements ?? [],
    recommended_journey_pillar: null,
    remix_options: spark?.remixOptions ?? [],
    editor_notes: [],
  })

  // The caller is a member of their own draft, as host.
  await admin
    .from('memberships')
    .upsert(
      { profile_id: input.profileId, circle_id: circleId, status: 'active', volunteer_role: 'host' },
      { onConflict: 'profile_id,circle_id' },
    )

  // Creating a Circle makes you a Host: this opens the Leadership tab (/lead).
  await ensureHostOnOwnership(input.profileId)

  return { circleId, slug }
}
