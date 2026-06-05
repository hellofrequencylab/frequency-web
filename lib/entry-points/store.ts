// Entry-point reads (ADR-126). An entry point is a qr_codes row owned by a member
// with template_id set (purpose stays NULL, so the unique (owner,purpose) index
// doesn't cap them — a member can have many). The new columns (template_id, flyer,
// campaign_id) aren't in the generated DB types until `supabase gen types` is re-run,
// so we read through an untyped handle (repo convention — see lib/zaps.ts). Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStyle, type QrStyle } from '@/lib/qr/style'
import { ROLE_HIERARCHY } from '@/lib/core/roles'
import { getEntryTemplate, type EntryTemplateId } from './templates'
import type { FlyerSlots } from './flyer'

export interface EntryPoint {
  id: string
  slug: string
  title: string
  destination: string
  templateId: EntryTemplateId
  flyer: FlyerSlots
  style: QrStyle
  scans: number
}

interface EntryRow {
  id: string
  slug: string
  title: string
  target_url: string | null
  template_id: string | null
  flyer: unknown
  style: unknown
  scan_count: number | null
}

function parseFlyer(raw: unknown, templateId: string | null): FlyerSlots {
  const def = getEntryTemplate(templateId).slots
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : fallback)
  return {
    headline: str(r.headline, def.headline),
    subhead: str(r.subhead, def.subhead),
    footer: str(r.footer, def.footer),
  }
}

function toEntryPoint(row: EntryRow): EntryPoint {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    destination: row.target_url ?? '',
    templateId: getEntryTemplate(row.template_id).id,
    flyer: parseFlyer(row.flyer, row.template_id),
    style: parseStyle(row.style),
    scans: row.scan_count ?? 0,
  }
}

const COLS = 'id, slug, title, target_url, template_id, flyer, style, scan_count'

/** Every entry point a member owns (template_id set), newest first. */
export async function listMyEntryPoints(ownerId: string): Promise<EntryPoint[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('qr_codes')
    .select(COLS)
    .eq('owner_profile_id', ownerId)
    .not('template_id', 'is', null)
    .order('created_at', { ascending: false })
  return ((data as EntryRow[] | null) ?? []).map(toEntryPoint)
}

/** How many entry points a member already has (drives the create-reward cap). */
export async function countMyEntryPoints(ownerId: string): Promise<number> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { count } = await db
    .from('qr_codes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_profile_id', ownerId)
    .not('template_id', 'is', null)
  return count ?? 0
}

/** Every entry point in a campaign (any owner) — the admin campaign view. */
export async function listEntryPointsByCampaign(campaignId: string): Promise<EntryPoint[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('qr_codes')
    .select(COLS)
    .eq('campaign_id', campaignId)
    .not('template_id', 'is', null)
    .order('created_at', { ascending: false })
  return ((data as EntryRow[] | null) ?? []).map(toEntryPoint)
}

export interface EntryPointWithOwner extends EntryPoint {
  ownerId: string | null
  ownerName: string | null
}

/** Campaign entry points with their owner (for the admin assign-to-crew view). */
export async function listEntryPointsByCampaignWithOwner(campaignId: string): Promise<EntryPointWithOwner[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('qr_codes')
    .select(`${COLS}, owner_profile_id`)
    .eq('campaign_id', campaignId)
    .not('template_id', 'is', null)
    .order('created_at', { ascending: false })
  const rows = (data as (EntryRow & { owner_profile_id: string | null })[] | null) ?? []

  const ownerIds = [...new Set(rows.map((r) => r.owner_profile_id).filter((id): id is string => !!id))]
  const names = new Map<string, string>()
  if (ownerIds.length) {
    const { data: owners } = await db.from('profiles').select('id, display_name').in('id', ownerIds)
    for (const o of (owners as { id: string; display_name: string }[] | null) ?? []) names.set(o.id, o.display_name)
  }
  return rows.map((r) => ({
    ...toEntryPoint(r),
    ownerId: r.owner_profile_id,
    ownerName: r.owner_profile_id ? names.get(r.owner_profile_id) ?? null : null,
  }))
}

export interface AssignableMember {
  id: string
  name: string
  role: string
}

/** Active crew-and-above members an operator can assign an entry point to. */
export async function listAssignableMembers(limit = 200): Promise<AssignableMember[]> {
  const crewPlus = ROLE_HIERARCHY.slice(ROLE_HIERARCHY.indexOf('crew')) as readonly string[]
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('profiles')
    .select('id, display_name, community_role')
    .eq('is_active', true)
    .eq('is_system', false)
    .in('community_role', crewPlus as string[])
    .order('display_name', { ascending: true })
    .limit(limit)
  return ((data as { id: string; display_name: string; community_role: string }[] | null) ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    role: p.community_role,
  }))
}

/** True when `profileId` is an active crew-and-above member (assignable). */
export async function isAssignableMember(profileId: string): Promise<boolean> {
  const crewPlus = ROLE_HIERARCHY.slice(ROLE_HIERARCHY.indexOf('crew')) as readonly string[]
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('profiles')
    .select('community_role, is_active, is_system')
    .eq('id', profileId)
    .maybeSingle()
  const p = data as { community_role: string; is_active: boolean; is_system: boolean } | null
  return !!p && p.is_active && !p.is_system && crewPlus.includes(p.community_role)
}

/** One entry point by id, only if `ownerId` owns it. */
export async function getMyEntryPoint(id: string, ownerId: string): Promise<EntryPoint | null> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('qr_codes')
    .select(`${COLS}, owner_profile_id, template_id`)
    .eq('id', id)
    .maybeSingle()
  const row = data as (EntryRow & { owner_profile_id: string | null }) | null
  if (!row || row.owner_profile_id !== ownerId || !row.template_id) return null
  return toEntryPoint(row)
}
