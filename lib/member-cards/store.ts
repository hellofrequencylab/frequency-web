// MEMBER CARDS, the IO half (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). card_faces and
// card_taps are service-role only (scripts/table-grants.txt `internal`), like member_cards, so THIS file
// is the tenancy wall: a member reads and writes only their own face, a Space face is written behind the
// Space owner gate the loyalty program uses, and the tap path reads one card by its token hash. Reads
// FAIL-SAFE (null / [] / the default face); writes FAIL-CLOSED. No 'use server' here; the actions are
// ./actions.ts. The switch is the counter scanners' one (`SCANNER_DEVICES_ENABLED`): cards are the
// same member_cards rows.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { effectiveTierFor } from '@/lib/billing/crew-grants'
import { normalizeCardToken, sha256Hex } from '@/lib/devices/credentials'
import { scannerDevicesEnabled } from '@/lib/devices/store'
import { loyaltyOwnerGate } from '@/lib/loyalty/store'
import { cardEdition, faceRow, readFace, type CardFace, type CardOwner } from './face'

/** On with the counter scanners: a member card is a member_cards row either way. */
export function memberCardsEnabled(): boolean {
  return scannerDevicesEnabled()
}

// The new tables are not in the generated types yet; the repo convention is an untyped handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient()
}

// ── Crew ─────────────────────────────────────────────────────────────────────────────────────────

/** Whether this member may GET a card: Crew, by the real effective tier (owner ruling 2026-10-22).
 *  Holding and controlling a card needs no tier, so a lapsed member can still pause theirs. */
export async function isCrewMember(profileId: string): Promise<boolean> {
  try {
    const { data } = await db().from('profiles').select('membership_tier').eq('id', profileId).maybeSingle()
    return (await effectiveTierFor(profileId, (data?.membership_tier as string | null) ?? null)).tier === 'crew'
  } catch {
    return false
  }
}

// ── Faces ────────────────────────────────────────────────────────────────────────────────────────

const FACE_COLS = 'mode, link_url, show_phone, show_email, show_links, swap_back, paused, cardholder_perk'

/** A member's face, or the default. Server-only callers (the tap route, the member's own editor). */
export async function readMemberFace(profileId: string): Promise<CardFace> {
  try {
    const { data } = await db().from('card_faces').select(FACE_COLS).eq('profile_id', profileId).maybeSingle()
    return { ...readFace(data), cardholderPerk: null }
  } catch {
    return readFace(null)
  }
}

/** A Space's face, or the default. Not gated: it holds nothing private (the Space page prints the perk). */
export async function readSpaceFace(spaceId: string): Promise<CardFace> {
  try {
    const { data } = await db().from('card_faces').select(FACE_COLS).eq('space_id', spaceId).maybeSingle()
    return readFace(data)
  } catch {
    return readFace(null)
  }
}

/** The signed-in member saves their own face. */
export async function writeMyFace(face: CardFace): Promise<CardFace | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  try {
    const row = { ...faceRow({ ...face, cardholderPerk: null }), profile_id: profileId, updated_at: new Date().toISOString() }
    const { error } = await db().from('card_faces').upsert(row, { onConflict: 'profile_id' })
    if (error) return null
    return readMemberFace(profileId)
  } catch {
    return null
  }
}

/** A Space's face, behind the Space owner gate (canEditProfile, or a janitor). */
export async function writeSpaceFace(spaceId: string, face: CardFace): Promise<CardFace | null> {
  if (!(await loyaltyOwnerGate(spaceId))) return null
  try {
    const row = { ...faceRow(face), space_id: spaceId, updated_at: new Date().toISOString() }
    const { error } = await db().from('card_faces').upsert(row, { onConflict: 'space_id' })
    if (error) return null
    return readSpaceFace(spaceId)
  } catch {
    return null
  }
}

// ── Cards ────────────────────────────────────────────────────────────────────────────────────────

/** A card as its owner's list shows it. */
export interface OwnedCard {
  id: string
  cardNumber: number | null
  edition: 'founders' | 'crew'
  /** The Space it checks in at, or null for every Space. */
  spaceName: string | null
  active: boolean
  createdAt: string
  lastUsedAt: string | null
}

type CardListRow = {
  id: string
  card_number: number | null
  space_id: string | null
  active: boolean
  created_at: string
  last_used_at: string | null
}

async function toOwnedCards(rows: CardListRow[]): Promise<OwnedCard[]> {
  const spaceIds = [...new Set(rows.map((r) => r.space_id).filter((v): v is string => !!v))]
  const names = new Map<string, string>()
  if (spaceIds.length) {
    const { data } = await db().from('spaces').select('id, name, brand_name').in('id', spaceIds)
    for (const s of (data ?? []) as { id: string; name: string; brand_name: string | null }[]) names.set(s.id, s.brand_name ?? s.name)
  }
  return rows.map((r) => ({
    id: r.id,
    cardNumber: r.card_number,
    edition: cardEdition(r.card_number),
    spaceName: r.space_id ? (names.get(r.space_id) ?? 'A Space') : null,
    active: !!r.active,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }))
}

const CARD_LIST_COLS = 'id, card_number, space_id, active, created_at, last_used_at'

/** The member's own cards (not the ones registered to a Space), newest first. */
export async function listMyCards(profileId: string): Promise<OwnedCard[]> {
  try {
    const { data } = await db()
      .from('member_cards')
      .select(CARD_LIST_COLS)
      .eq('profile_id', profileId)
      .is('face_space_id', null)
      .order('created_at', { ascending: false })
      .limit(20)
    return toOwnedCards((data ?? []) as CardListRow[])
  } catch {
    return []
  }
}

/** The cards registered to a Space, behind the Space owner gate. */
export async function listSpaceCards(spaceId: string): Promise<OwnedCard[]> {
  if (!(await loyaltyOwnerGate(spaceId))) return []
  try {
    const { data } = await db()
      .from('member_cards')
      .select(CARD_LIST_COLS)
      .eq('face_space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(50)
    return toOwnedCards((data ?? []) as CardListRow[])
  } catch {
    return []
  }
}

/** Pause or un-pause one of the member's own cards (the lost-card switch for a single card). */
export async function setMyCardActive(cardId: string, active: boolean): Promise<boolean> {
  const profileId = await getMyProfileId()
  if (!profileId) return false
  try {
    const { error } = await db()
      .from('member_cards')
      .update(active ? { active: true, revoked_at: null } : { active: false, revoked_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('profile_id', profileId)
    return !error
  } catch {
    return false
  }
}

/** Switch one card registered to a Space on or off, behind the Space owner gate (LIVE-1297). */
export async function setSpaceCardActive(spaceId: string, cardId: string, active: boolean): Promise<boolean> {
  if (!(await loyaltyOwnerGate(spaceId))) return false
  try {
    const { error } = await db()
      .from('member_cards')
      .update(active ? { active: true, revoked_at: null } : { active: false, revoked_at: new Date().toISOString() })
      .eq('id', cardId)
      .eq('face_space_id', spaceId)
    return !error
  } catch {
    return false
  }
}

// ── The tap ──────────────────────────────────────────────────────────────────────────────────────

/** A card resolved for a phone tap. */
export interface TappedCard {
  cardId: string
  cardNumber: number | null
  holderProfileId: string
  owner: CardOwner
  face: CardFace
}

/**
 * The card a /c/<token> tap names, with its owner and face. Null when the token is malformed, the
 * card is unknown or revoked, or the owner is gone. A card registered to a Space reads the Space's
 * face; every other card reads its holder's.
 */
export async function resolveTappedCard(rawToken: string): Promise<TappedCard | null> {
  const token = normalizeCardToken(rawToken)
  if (!token) return null
  try {
    const { data: card } = await db()
      .from('member_cards')
      .select('id, profile_id, face_space_id, card_number, active')
      .eq('token_hash', sha256Hex(token))
      .maybeSingle()
    if (!card || !card.active) return null
    if (card.face_space_id) {
      const { data: space } = await db().from('spaces').select('id, slug').eq('id', card.face_space_id).maybeSingle()
      if (!space?.slug) return null
      return {
        cardId: card.id,
        cardNumber: card.card_number ?? null,
        holderProfileId: card.profile_id,
        owner: { kind: 'space', spaceId: space.id, slug: space.slug },
        face: await readSpaceFace(space.id),
      }
    }
    const { data: profile } = await db().from('profiles').select('id, handle').eq('id', card.profile_id).maybeSingle()
    if (!profile?.handle) return null
    return {
      cardId: card.id,
      cardNumber: card.card_number ?? null,
      holderProfileId: card.profile_id,
      owner: { kind: 'member', profileId: profile.id, handle: profile.handle },
      face: await readMemberFace(profile.id),
    }
  } catch {
    return null
  }
}

type CardTapKind = 'open' | 'save' | 'swap'

/** Count one tap or face action for the owner's numbers. Best-effort: a failure never blocks a tap. */
export async function logCardTap(card: Pick<TappedCard, 'cardId' | 'owner'>, kind: CardTapKind, tapperProfileId: string | null): Promise<void> {
  try {
    await db()
      .from('card_taps')
      .insert({
        card_id: card.cardId,
        owner_profile_id: card.owner.kind === 'member' ? card.owner.profileId : null,
        owner_space_id: card.owner.kind === 'space' ? card.owner.spaceId : null,
        kind,
        tapper_profile_id: tapperProfileId,
      })
  } catch {
    /* best-effort */
  }
}

/** The owner's three numbers. */
export interface CardStats {
  taps: number
  saves: number
  swaps: number
}

async function countTaps(column: 'owner_profile_id' | 'owner_space_id', id: string, kind: CardTapKind): Promise<number> {
  const { count } = await db().from('card_taps').select('id', { count: 'exact', head: true }).eq(column, id).eq('kind', kind)
  return count ?? 0
}

/** A member's numbers (their own read) or a Space's (behind the owner gate). FAIL-SAFE to zeros. */
export async function readCardStats(owner: { kind: 'member'; profileId: string } | { kind: 'space'; spaceId: string }): Promise<CardStats> {
  const zero = { taps: 0, saves: 0, swaps: 0 }
  try {
    if (owner.kind === 'space' && !(await loyaltyOwnerGate(owner.spaceId))) return zero
    const column = owner.kind === 'member' ? 'owner_profile_id' : 'owner_space_id'
    const id = owner.kind === 'member' ? owner.profileId : owner.spaceId
    const [taps, saves, swaps] = await Promise.all([countTaps(column, id, 'open'), countTaps(column, id, 'save'), countTaps(column, id, 'swap')])
    return { taps, saves, swaps }
  } catch {
    return zero
  }
}
