// MEMBER CARDS, the IO half (LIVE-1282, ADR-1874, docs/LOYALTY.md "Member cards"). card_faces and
// card_taps are service-role only (scripts/table-grants.txt `internal`), like member_cards, so THIS file
// is the tenancy wall: a member reads and writes only their own face, a Space face is written behind the
// Space owner gate the loyalty program uses, and the tap path reads one card by its token hash. Reads
// FAIL-SAFE (null / [] / the default face); writes FAIL-CLOSED. No 'use server' here; the actions are
// ./actions.ts. The switch is the counter scanners' one (`SCANNER_DEVICES_ENABLED`): cards are the
// same member_cards rows.

import { createAdminClient } from '@/lib/supabase/admin'
import { effectiveTierFor } from '@/lib/billing/crew-grants'
import { normalizeCardToken, sha256Hex } from '@/lib/devices/credentials'
import { scannerDevicesEnabled } from '@/lib/devices/store'
import { readFace, type CardFace, type CardOwner } from './face'

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
async function readMemberFace(profileId: string): Promise<CardFace> {
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

// ── Cards ────────────────────────────────────────────────────────────────────────────────────────

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
