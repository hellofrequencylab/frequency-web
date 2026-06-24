// Starter Circles — read + parse layer over circle_templates / circle_profiles.
// Server-only (admin client; the column reads are explicitly filtered, e.g.
// is_active for the public gallery). Callers above enforce authz. Coercion is
// defensive: jsonb columns are re-shaped, never trusted raw.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PillarSlug } from '@/lib/pillars'
import {
  type CircleTemplate,
  type CircleCallout,
  type CircleRhythm,
  type PillarsInside,
  type CalloutAnchor,
  CIRCLE_TEMPLATES_FLAG,
} from './templates'

// circle_templates / circle_profiles are net-new tables, absent from the
// generated DB types until their migration is applied and types are regenerated.
// This is the "genuinely untyped" case the ADR-246 lint rule sanctions; drop the
// handle and use the typed client once the tables land in the generated types.
function db(): SupabaseClient {
  // eslint-disable-next-line no-restricted-syntax -- tables not in generated types pre-apply (see note above)
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

const TEMPLATE_COLS =
  'id, slug, name, primary_pillar, identity, audience, card, one_liner, about, pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options, callouts, image_url, is_active, display_order'

export function rowToTemplate(row: Record<string, unknown>): CircleTemplate {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    primaryPillar: asPillar(row.primary_pillar) ?? 'mind',
    identity: String(row.identity ?? ''),
    audience: String(row.audience ?? ''),
    card: String(row.card ?? ''),
    oneLiner: String(row.one_liner ?? ''),
    about: row.about == null ? null : String(row.about),
    pillarsInside: asPillarsInside(row.pillars_inside),
    meetup: asRhythm(row.meetup),
    gathering: asRhythm(row.gathering),
    thread: row.thread == null ? null : String(row.thread),
    format: row.format == null ? null : String(row.format),
    sizeLabel: row.size_label == null ? null : String(row.size_label),
    agreements: asStrArray(row.agreements),
    recommendedJourneyPillar: asPillar(row.recommended_journey_pillar),
    remixOptions: asStrArray(row.remix_options),
    callouts: asCallouts(row.callouts),
    imageUrl: row.image_url == null ? null : String(row.image_url),
    isActive: Boolean(row.is_active),
    displayOrder: typeof row.display_order === 'number' ? row.display_order : 0,
  }
}

/** Active templates for the member gallery, in display order. */
export async function getActiveTemplates(): Promise<CircleTemplate[]> {
  const admin = db()
  const { data } = await admin.from('circle_templates').select(TEMPLATE_COLS).eq('is_active', true).order('display_order')
  return ((data ?? []) as Record<string, unknown>[]).map(rowToTemplate)
}

/** Every template (operator admin), in display order — active and not. */
export async function getAllTemplates(): Promise<CircleTemplate[]> {
  const admin = db()
  const { data } = await admin.from('circle_templates').select(TEMPLATE_COLS).order('display_order')
  return ((data ?? []) as Record<string, unknown>[]).map(rowToTemplate)
}

export async function getTemplateById(id: string): Promise<CircleTemplate | null> {
  const admin = db()
  const { data } = await admin.from('circle_templates').select(TEMPLATE_COLS).eq('id', id).maybeSingle()
  return data ? rowToTemplate(data as Record<string, unknown>) : null
}

export async function getTemplateBySlug(slug: string): Promise<CircleTemplate | null> {
  const admin = db()
  const { data } = await admin.from('circle_templates').select(TEMPLATE_COLS).eq('slug', slug).maybeSingle()
  return data ? rowToTemplate(data as Record<string, unknown>) : null
}

/** The global master switch (platform_flags). Fail-safe false. */
export async function templatesEnabled(): Promise<boolean> {
  try {
    const admin = db()
    const { data } = await admin.from('platform_flags').select('value').eq('key', CIRCLE_TEMPLATES_FLAG).maybeSingle()
    return Boolean((data as { value?: boolean } | null)?.value)
  } catch {
    return false
  }
}
