'use server'

import { headers } from 'next/headers'
import { getMyProfileId } from '@/lib/auth'
import { rateLimitOk } from '@/lib/rate-limit'
import { memberCardsEnabled, resolveTappedCard } from '@/lib/member-cards/store'
import { performCardSwap, validateSwapInput } from '@/lib/member-cards/swap'

export type SwapResult = { ok: true } | { ok: false; error: string }

const CLOSED: SwapResult = { ok: false, error: 'This card is not taking contacts right now.' }
const WRITE_FAILED: SwapResult = { ok: false, error: 'We could not send your details. Please try again.' }

// Swap contacts on a member card's face (LIVE-1282, lib/member-cards/swap.ts). AUTH: the card, its owner
// and its face are resolved on the server from the token; nothing the form sends names an owner. A
// signed-in tapper's profile link comes from the session. An open, unauthenticated write, so it is
// throttled per IP (fails CLOSED in production without Upstash, lib/rate-limit.ts).
export async function submitCardSwap(input: { token: string; name: string; email?: string; phone?: string; note?: string }): Promise<SwapResult> {
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('card_swap', ip, 5, '10 m'))) {
    return { ok: false, error: 'Too many tries. Please wait a few minutes.' }
  }

  if (!memberCardsEnabled()) return CLOSED
  const card = await resolveTappedCard(typeof input?.token === 'string' ? input.token : '')
  if (!card || card.face.paused || !card.face.swapBack) return CLOSED

  const tapper = await getMyProfileId()
  if (card.owner.kind === 'member' && tapper === card.owner.profileId) return { ok: false, error: 'This is your own card.' }

  const checked = validateSwapInput(input, { forSpace: card.owner.kind === 'space' })
  if (!checked.ok) return checked

  return (await performCardSwap(card, checked.value, tapper)) ? { ok: true } : WRITE_FAILED
}
