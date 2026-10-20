// COUNTER SCANNERS, the IO half (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Reads and writes on
// scanner_devices and member_cards through the service-role admin client. Both tables are service-role
// only (scripts/table-grants.txt `internal`), so THIS file is the tenancy wall:
//   • the DEVICE side is pinned by the device credential: a device acts only for its own space_id;
//   • the OWNER side runs behind scannerOwnerGate (canEditProfile on the Space AND the per-Space
//     check-in function gate, the one ensureCheckinNode applies before it mints the door node).
// Reads FAIL-SAFE (null / []); writes FAIL-CLOSED on a gate miss. No 'use server' here (it exports
// types and the gate); the owner actions live in ./actions.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor } from '@/lib/core/roles'
import { envFlag } from '@/lib/env/string'
import type { Space } from '@/lib/spaces/types'
import { newCardToken, newDeviceSecret, parseDeviceHeader, secretMatches, sha256Hex } from './credentials'

/** The launch switch (`SCANNER_DEVICES_ENABLED`, envFlag; gate in docs/RUNBOOKS.md "Counter scanners").
 *  Off: both device endpoints answer 404 (the firmware reads that as "backend not set up"), /c/<token>
 *  goes to /rewards without a lookup, and the owner panel says scanners are not open. */
export function scannerDevicesEnabled(): boolean {
  return envFlag('SCANNER_DEVICES_ENABLED')
}

/** A Space may hold this many live scanners, and a member this many live cards at one Space. */
export const SCANNER_LIMITS = { devicesPerSpace: 10, cardsPerMember: 5, labelMax: 60 } as const

/** An authenticated device, as the routes consume it. */
export interface ScannerDevice {
  id: string
  spaceId: string
  label: string
}

// ── The device side ──────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the `X-Frequency-Device` header to an active device, or null. One indexed read by primary
 * key, then a constant-time compare of sha256(secret). A revoked device, an unknown id and a wrong
 * secret all read the same (null), so the reply never says which part was wrong.
 */
export async function authenticateDevice(header: string | null): Promise<ScannerDevice | null> {
  const parsed = parseDeviceHeader(header)
  if (!parsed) return null
  try {
    const { data } = await createAdminClient()
      .from('scanner_devices')
      .select('id, space_id, label, secret_hash, active')
      .eq('id', parsed.id)
      .maybeSingle()
    if (!data || !data.active || !secretMatches(parsed.secret, data.secret_hash)) return null
    return { id: data.id, spaceId: data.space_id, label: data.label }
  } catch {
    return null
  }
}

/** Stamp the device's last contact. Best-effort: a failed stamp never fails the request. */
export async function touchDevice(deviceId: string): Promise<void> {
  try {
    await createAdminClient().from('scanner_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceId)
  } catch {
    /* best-effort */
  }
}

/** A card as the scan needs it. */
export interface CardRow {
  id: string
  profileId: string
  spaceId: string | null
  uidHash: string | null
}

/** The live card whose token hashes to `tokenHash`, or null. */
export async function findActiveCard(tokenHash: string): Promise<CardRow | null> {
  try {
    const { data } = await createAdminClient()
      .from('member_cards')
      .select('id, profile_id, space_id, uid_hash, active')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (!data || !data.active) return null
    return { id: data.id, profileId: data.profile_id, spaceId: data.space_id, uidHash: data.uid_hash }
  } catch {
    return null
  }
}

/** Bind a chip UID to a card on its first scan. Only fills an empty uid_hash, so a race binds once. */
export async function bindCardUid(cardId: string, uidHash: string): Promise<void> {
  try {
    await createAdminClient().from('member_cards').update({ uid_hash: uidHash }).eq('id', cardId).is('uid_hash', null)
  } catch {
    /* best-effort: the next scan binds it */
  }
}

/** Stamp the card's last use. Best-effort. */
export async function touchCard(cardId: string): Promise<void> {
  try {
    await createAdminClient().from('member_cards').update({ last_used_at: new Date().toISOString() }).eq('id', cardId)
  } catch {
    /* best-effort */
  }
}

/** The member's display name for the device screen, never their handle or anything else. */
export async function readMemberName(profileId: string): Promise<string> {
  try {
    const { data } = await createAdminClient().from('profiles').select('display_name').eq('id', profileId).maybeSingle()
    return data?.display_name?.trim() || 'Member'
  } catch {
    return 'Member'
  }
}

/** The Space's own pin, which a counter scanner is standing on. Null when it has none. */
export async function readSpacePin(spaceId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await createAdminClient().from('spaces').select('latitude, longitude').eq('id', spaceId).maybeSingle()
    const lat = Number(data?.latitude)
    const lng = Number(data?.longitude)
    return data && data.latitude != null && data.longitude != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null
  } catch {
    return null
  }
}

type IssueOutcome =
  | { ok: true; token: string; displayName: string }
  | { ok: false; reason: 'unknown_member' | 'too_many_cards' | 'failed' }

/**
 * Mint a card for the member with `handle`, valid at the device's own Space only. The token is
 * returned once and only its hash is stored. A member holds at most SCANNER_LIMITS.cardsPerMember live
 * cards at one Space, so a lost card is replaced, not stockpiled.
 */
export async function issueCardForHandle(device: ScannerDevice, handle: string): Promise<IssueOutcome> {
  try {
    const db = createAdminClient()
    const { data: profile } = await db.from('profiles').select('id, display_name').eq('handle', handle).maybeSingle()
    if (!profile) return { ok: false, reason: 'unknown_member' }
    const { count } = await db
      .from('member_cards')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profile.id)
      .eq('space_id', device.spaceId)
      .eq('active', true)
    if ((count ?? 0) >= SCANNER_LIMITS.cardsPerMember) return { ok: false, reason: 'too_many_cards' }
    const token = newCardToken()
    const { error } = await db.from('member_cards').insert({
      profile_id: profile.id,
      space_id: device.spaceId,
      token_hash: sha256Hex(token),
      issued_by: device.id,
    })
    if (error) return { ok: false, reason: 'failed' }
    return { ok: true, token, displayName: profile.display_name?.trim() || 'Member' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Whether a card token names a live card. The /c/<token> landing reads only this. */
export async function cardTokenIsLive(tokenHash: string): Promise<boolean> {
  return (await findActiveCard(tokenHash)) !== null
}

// ── The owner side ───────────────────────────────────────────────────────────────────────────────

/**
 * The gate every owner read and write runs behind. A write needs canEditProfile on the Space AND the
 * per-Space check-in function (default moderator): the same pair ensureCheckinNode requires to mint
 * the door code a scanner checks members in on. A janitor previewing may READ, never write.
 */
export async function scannerOwnerGate(
  spaceId: string,
  mode: 'read' | 'write',
): Promise<{ space: Space; callerId: string } | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller.id)
  const canWrite = caps.canEditProfile && spaceFunctionAccess(space, 'checkin', caps.role)
  if (mode === 'write') return canWrite ? { space, callerId: caller.id } : null
  return canWrite || isJanitor(caller.webRole) ? { space, callerId: caller.id } : null
}

/** A scanner on the owner's list. */
export interface ScannerDeviceSummary {
  id: string
  label: string
  active: boolean
  createdAt: string
  lastSeenAt: string | null
}

/** A card on the owner's list. */
export interface MemberCardSummary {
  id: string
  memberName: string
  memberHandle: string | null
  issuedByLabel: string | null
  active: boolean
  createdAt: string
  lastUsedAt: string | null
}

/** The Space's scanners, newest first. Gated read. */
export async function listScannerDevices(spaceId: string): Promise<ScannerDeviceSummary[]> {
  if (!(await scannerOwnerGate(spaceId, 'read'))) return []
  try {
    const { data } = await createAdminClient()
      .from('scanner_devices')
      .select('id, label, active, created_at, last_seen_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(50)
    return (data ?? []).map((d) => ({
      id: d.id,
      label: d.label,
      active: d.active,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
    }))
  } catch {
    return []
  }
}

/** The cards issued for this Space, newest first, with the member's name. Gated read. */
export async function listMemberCards(spaceId: string): Promise<MemberCardSummary[]> {
  if (!(await scannerOwnerGate(spaceId, 'read'))) return []
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('member_cards')
      .select('id, profile_id, issued_by, active, created_at, last_used_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(200)
    const rows = data ?? []
    if (rows.length === 0) return []
    const profileIds = [...new Set(rows.map((r) => r.profile_id))]
    const deviceIds = [...new Set(rows.map((r) => r.issued_by).filter((d): d is string => !!d))]
    const [{ data: people }, { data: devices }] = await Promise.all([
      db.from('profiles').select('id, display_name, handle').in('id', profileIds),
      deviceIds.length
        ? db.from('scanner_devices').select('id, label').eq('space_id', spaceId).in('id', deviceIds)
        : Promise.resolve({ data: [] as { id: string; label: string }[] }),
    ])
    const names = new Map((people ?? []).map((p) => [p.id, p]))
    const labels = new Map((devices ?? []).map((d) => [d.id, d.label]))
    return rows.map((r) => ({
      id: r.id,
      memberName: names.get(r.profile_id)?.display_name?.trim() || 'A member',
      memberHandle: names.get(r.profile_id)?.handle ?? null,
      issuedByLabel: r.issued_by ? (labels.get(r.issued_by) ?? null) : null,
      active: r.active,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    }))
  } catch {
    return []
  }
}

/**
 * Register a scanner for the Space. Returns the device id and the one-time secret, or null on a gate
 * miss, a full Space, or a write error. The secret is never stored or shown again.
 */
export async function registerScannerDevice(
  spaceId: string,
  label: string,
): Promise<{ id: string; secret: string } | 'limit' | null> {
  const gate = await scannerOwnerGate(spaceId, 'write')
  if (!gate) return null
  try {
    const db = createAdminClient()
    const { count } = await db
      .from('scanner_devices')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .eq('active', true)
    if ((count ?? 0) >= SCANNER_LIMITS.devicesPerSpace) return 'limit'
    const secret = newDeviceSecret()
    const { data, error } = await db
      .from('scanner_devices')
      .insert({ space_id: spaceId, label, secret_hash: sha256Hex(secret), created_by: gate.callerId })
      .select('id')
      .maybeSingle()
    if (error || !data) return null
    return { id: data.id, secret }
  } catch {
    return null
  }
}

/** Revoke one of the Space's scanners. Its next request is refused. Scoped by space_id. */
export async function revokeScannerDevice(spaceId: string, deviceId: string): Promise<boolean> {
  if (!(await scannerOwnerGate(spaceId, 'write'))) return false
  try {
    const { error } = await createAdminClient()
      .from('scanner_devices')
      .update({ active: false, revoked_at: new Date().toISOString() })
      .eq('id', deviceId)
      .eq('space_id', spaceId)
    return !error
  } catch {
    return false
  }
}

/** Revoke one of the Space's cards. Scoped by space_id, so a Frequency-wide card is never touched here. */
export async function revokeMemberCard(spaceId: string, cardId: string): Promise<boolean> {
  if (!(await scannerOwnerGate(spaceId, 'write'))) return false
  try {
    const { error } = await createAdminClient()
      .from('member_cards')
      .update({ active: false, revoked_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('space_id', spaceId)
    return !error
  } catch {
    return false
  }
}
