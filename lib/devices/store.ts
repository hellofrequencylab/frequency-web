// COUNTER SCANNERS, the IO half (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Reads and writes on
// scanner_devices and member_cards through the service-role admin client. Both tables are service-role
// only (scripts/table-grants.txt `internal`), so THIS file is the tenancy wall:
//   • the DEVICE side is pinned by the device credential: a device acts only for its own space_id;
//   • the OWNER side runs behind scannerOwnerGate (canEditProfile on the Space AND the per-Space
//     check-in function gate, the one ensureCheckinNode applies before it mints the door node).
//   • the USB CONSOLE (the CyberUnicorn in the admin menu) runs behind consoleStaffGate: platform staff.
// Reads FAIL-SAFE (null / []); writes FAIL-CLOSED on a gate miss. No 'use server' here (it exports
// types and the gate); the owner actions live in ./actions.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceMembership } from '@/lib/spaces/membership'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isJanitor, isStaff } from '@/lib/core/roles'
import { envFlag } from '@/lib/env/string'
import type { Space } from '@/lib/spaces/types'
import { newCardToken, newDeviceSecret, parseDeviceHeader, secretMatches, sha256Hex, signatureMatches } from './credentials'

/** The launch switch (`SCANNER_DEVICES_ENABLED`, envFlag; gate in docs/RUNBOOKS.md "Counter scanners").
 *  Off: both device endpoints answer 404 (the firmware reads that as "backend not set up"), /c/<token>
 *  goes to /rewards without a lookup, and the owner panel says scanners are not open. */
export function scannerDevicesEnabled(): boolean {
  return envFlag('SCANNER_DEVICES_ENABLED')
}

/** A Space may hold this many live scanners, and a member this many live cards at one Space (and as
 *  many Frequency-wide member cards). */
export const SCANNER_LIMITS = { devicesPerSpace: 10, cardsPerMember: 5, labelMax: 60 } as const

/** An authenticated device, as the routes consume it. */
export interface ScannerDevice {
  id: string
  spaceId: string
  label: string
}

/**
 * The CyberUnicorn console's gate (LIVE-1180): platform staff only (web_role admin or janitor). The
 * console lives in the admin menu, not on a Space's page, and staff write cards for any Space a
 * member asked at. View-as aware through getCallerProfile, so a janitor previewing a member is refused.
 */
export async function consoleStaffGate(): Promise<{ callerId: string } | null> {
  const caller = await getCallerProfile()
  return caller && isStaff(caller.webRole) ? { callerId: caller.id } : null
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

/**
 * Resolve a scan relayed through the USB cable (X-Frequency-Device-Id + X-Frequency-Signature) to an
 * active device, or null. The board signed the exact body with a key derived from its secret, so the
 * computer that forwarded it never held the secret. Same one read and same silent null as above.
 */
export async function authenticateSignedDevice(rawId: string | null, signature: string | null, body: string): Promise<ScannerDevice | null> {
  const id = typeof rawId === 'string' ? rawId.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null
  try {
    const { data } = await createAdminClient()
      .from('scanner_devices')
      .select('id, space_id, label, secret_hash, active')
      .eq('id', id)
      .maybeSingle()
    if (!data || !data.active || !signatureMatches(data.secret_hash, data.id, body, signature)) return null
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
interface CardRow {
  id: string
  profileId: string
  spaceId: string | null
  uidHash: string | null
  /** The printed number (LIVE-1282), null on a card minted before numbering. */
  cardNumber: number | null
  /** The Space a Space card is registered to, else null. */
  faceSpaceId: string | null
}

type CardSelect = {
  id: string
  profile_id: string
  space_id: string | null
  uid_hash: string | null
  active: boolean
  card_number?: number | null
  face_space_id?: string | null
}

/** The live card whose token hashes to `tokenHash`, or null. */
export async function findActiveCard(tokenHash: string): Promise<CardRow | null> {
  try {
    const { data } = await createAdminClient()
      .from('member_cards')
      .select('id, profile_id, space_id, uid_hash, active, card_number, face_space_id')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    // card_number and face_space_id are newer than the generated types.
    const row = data as unknown as CardSelect | null
    if (!row || !row.active) return null
    return {
      id: row.id,
      profileId: row.profile_id,
      spaceId: row.space_id,
      uidHash: row.uid_hash,
      cardNumber: row.card_number ?? null,
      faceSpaceId: row.face_space_id ?? null,
    }
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

/** What the console writes (LIVE-1282, docs/LOYALTY.md "Member cards"). A MEMBER card is Frequency-wide
 *  (space_id null: it checks in at every Space's counter scanner) and opens its holder's own face. A SPACE
 *  card is registered to one Space (face_space_id): it opens that Space's face, checks in there only, and
 *  goes to someone on that Space's team. Both carry a printed number. */
export type ConsoleCardKind = 'member' | 'space'

type ConsoleCardOutcome =
  | { ok: true; cardId: string; token: string; displayName: string; cardNumber: number; spaceId: string | null }
  | { ok: false; reason: 'forbidden' | 'unknown_member' | 'not_crew' | 'no_space' | 'not_space_staff' | 'too_many_cards' | 'failed' }

/** Whether the profile is on the Space's team: its owner, or an active member above viewer. */
async function onSpaceTeam(spaceId: string, profileId: string): Promise<boolean> {
  const space = await getSpaceById(spaceId)
  if (!space) return false
  if (space.ownerProfileId === profileId) return true
  const m = await getSpaceMembership(spaceId, profileId)
  return !!m && m.status === 'active' && m.role !== 'viewer'
}

/**
 * Mint a card from the CyberUnicorn console (plugged into a staff member's computer over USB) for the
 * member with `handle`. Staff only (consoleStaffGate). A member card needs the holder to be Crew (owner
 * ruling 2026-10-22, isCrewMember) and is minted with space_id null; a Space card needs a Space and a
 * holder on its team, and is minted with space_id and face_space_id both set to it. Either one takes the
 * next Frequency-wide number from next_member_card_number() (never reissued, so a discarded mint burns
 * its number). The per-member cap (SCANNER_LIMITS.cardsPerMember) counts live cards in the same scope:
 * the Frequency-wide ones together, or one Space's. `issued_by` stays null because no registered scanner
 * minted it. The browser writes `SITE_URL/c/<token>` to the card, then binds the chip UID
 * (bindConsoleCard) or, if the write failed, discards the row (discardConsoleCard), so a card that never
 * left the reader is not left live.
 */
export async function issueCardFromConsole(kind: ConsoleCardKind, spaceId: string | null, handle: string): Promise<ConsoleCardOutcome> {
  if (!(await consoleStaffGate())) return { ok: false, reason: 'forbidden' }
  if (kind === 'space' && !spaceId) return { ok: false, reason: 'no_space' }
  const scope = kind === 'space' ? spaceId : null
  try {
    const db = createAdminClient()
    const { data: profile } = await db.from('profiles').select('id, display_name').eq('handle', handle).maybeSingle()
    if (!profile) return { ok: false, reason: 'unknown_member' }
    if (kind === 'member') {
      // Imported here: lib/member-cards/store imports this file, so a static import would be a cycle.
      const { isCrewMember } = await import('@/lib/member-cards/store')
      if (!(await isCrewMember(profile.id))) return { ok: false, reason: 'not_crew' }
    }
    if (scope && !(await onSpaceTeam(scope, profile.id))) return { ok: false, reason: 'not_space_staff' }
    const live = db.from('member_cards').select('id', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('active', true)
    const { count } = await (scope ? live.eq('space_id', scope) : live.is('space_id', null))
    if ((count ?? 0) >= SCANNER_LIMITS.cardsPerMember) return { ok: false, reason: 'too_many_cards' }
    // The one numbering writer (migration 20270346024000).
    const { data: num, error: numError } = await db.rpc('next_member_card_number')
    const cardNumber = Number(num)
    if (numError || !Number.isInteger(cardNumber) || cardNumber < 1) return { ok: false, reason: 'failed' }
    const token = newCardToken()
    const row = { profile_id: profile.id, space_id: scope, face_space_id: scope, card_number: cardNumber, token_hash: sha256Hex(token), issued_by: null }
    const { data, error } = await db
      .from('member_cards')
      .insert(row as never)
      .select('id')
      .maybeSingle()
    if (error || !data) return { ok: false, reason: 'failed' }
    return { ok: true, cardId: data.id, token, displayName: profile.display_name?.trim() || 'Member', cardNumber, spaceId: scope }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Bind the chip the console just wrote to its card, so a copy on another chip is refused at the
 *  counter. Fills an empty uid_hash only, scoped by the card's space_id (null for a member card). */
export async function bindConsoleCard(spaceId: string | null, cardId: string, uidHash: string): Promise<boolean> {
  if (!(await consoleStaffGate())) return false
  try {
    const q = createAdminClient().from('member_cards').update({ uid_hash: uidHash }).eq('id', cardId).is('uid_hash', null)
    const { error } = await (spaceId ? q.eq('space_id', spaceId) : q.is('space_id', null))
    return !error
  } catch {
    return false
  }
}

/** Remove a console-minted card whose write never landed. Only an unbound, never-used, console-minted
 *  row goes, so this can never delete a card that is out in the world. Scoped like bindConsoleCard. */
export async function discardConsoleCard(spaceId: string | null, cardId: string): Promise<boolean> {
  if (!(await consoleStaffGate())) return false
  try {
    const q = createAdminClient()
      .from('member_cards')
      .delete()
      .eq('id', cardId)
      .is('issued_by', null)
      .is('uid_hash', null)
      .is('last_used_at', null)
    const { error } = await (spaceId ? q.eq('space_id', spaceId) : q.is('space_id', null))
    return !error
  } catch {
    return false
  }
}

/**
 * Register a counter scanner for any Space from the CyberUnicorn console, so staff can make the board
 * plugged into their computer that Space's scanner and hand it the secret over USB (build plan phase 3).
 * Staff only (consoleStaffGate). Same per-Space cap and one-time secret as the owner path.
 */
export async function registerScannerFromConsole(
  spaceId: string,
  label: string,
): Promise<{ id: string; secret: string } | 'forbidden' | 'limit' | null> {
  const gate = await consoleStaffGate()
  if (!gate) return 'forbidden'
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

/** Which Space a board's scanner id belongs to, for the console's status line. Staff only. */
export async function describeScannerForConsole(deviceId: string): Promise<{ spaceId: string; spaceName: string; label: string; active: boolean } | null> {
  if (!(await consoleStaffGate())) return null
  try {
    const { data } = await createAdminClient()
      .from('scanner_devices')
      .select('space_id, label, active, spaces(name, brand_name)')
      .eq('id', deviceId)
      .maybeSingle()
    if (!data) return null
    const sp = data.spaces as unknown as { name: string | null; brand_name: string | null } | null
    return { spaceId: data.space_id, spaceName: sp?.brand_name?.trim() || sp?.name?.trim() || 'Space', label: data.label, active: data.active }
  } catch {
    return null
  }
}

/** Revoke a scanner from the console when its board forgets the setup. Staff only. */
export async function revokeScannerFromConsole(deviceId: string): Promise<boolean> {
  if (!(await consoleStaffGate())) return false
  try {
    const { error } = await createAdminClient()
      .from('scanner_devices')
      .update({ active: false, revoked_at: new Date().toISOString() })
      .eq('id', deviceId)
      .eq('active', true)
    return !error
  } catch {
    return false
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
