import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { tapTarget } from '@/lib/member-cards/face'
import { logCardTap, memberCardsEnabled, resolveTappedCard } from '@/lib/member-cards/store'
import { payCardConnect } from '@/lib/member-cards/rewards'
import { captureQrContact } from '@/lib/connections/qr-capture'
import { referralsEnabled } from '@/lib/platform-flags'

export const dynamic = 'force-dynamic'

// /c/<token>: what a member card opens on a phone (LIVE-1125, then LIVE-1282 / ADR-1874, docs/LOYALTY.md
// "Member cards"). The chip always holds this one link; the card's FACE, set by its owner on the website,
// decides where the tap goes (lib/member-cards/face.ts tapTarget):
//   • paused          → /card/<token>, which says "This card is paused." and nothing about the owner.
//   • owner_settings  → the owner tapped their own member card: /crew/card, the fastest way to set it.
//   • page            → the owner's own page (/people/<handle>, or /spaces/<slug> for a Space's card).
//   • link            → the one https link the owner set (a temporary redirect, never cached).
//   • face            → /card/<token>, the virtual card (Save contact, Swap contacts).
// It checks NOBODY in: a check-in needs the Space's counter scanner (POST /api/v1/devices/scan) or the
// door code. A revoked or unknown card lands on /code-unavailable. Every tap but the owner's own is
// counted as an 'open' for the owner's numbers.
//
// A SIGNED-IN member tapping another member's card also keeps the card owner as a private contact in
// the tapper's My Contacts (the /q scan-to-contact capture, ADR-361) and pays the connect (Zaps, capped
// in lib/member-cards/rewards.ts). ONE WAY on purpose: ADR-361 and CRM-STRATEGY §4 hold that the
// reverse write (the tapper landing in the OWNER's book) needs the tapper's explicit consent, so it
// happens only when the tapper presses Swap contacts on the face. A SIGNED-OUT tapper of a member's card
// gets the owner's referral cookie, exactly as /q drops it for a member's personal code, so a later join
// credits the card owner (lib/qr/referral.ts applies it at onboarding).
//
// While SCANNER_DEVICES_ENABLED is off the route keeps its first behaviour: the reader's own Regulars
// cards on /rewards, through sign-in when signed out, with no lookup.

const REF_COOKIE = 'fq_ref'
const REF_MAX_AGE = 60 * 60 * 24 * 30

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = new URL(request.url).origin
  const to = (path: string) => NextResponse.redirect(new URL(path, origin))
  const tapper = await getMyProfileId()

  if (!memberCardsEnabled()) return to(tapper ? '/rewards' : `/sign-in?next=${encodeURIComponent('/rewards')}`)

  const { token } = await params
  const card = await resolveTappedCard(token)
  if (!card) return to('/code-unavailable')

  const target = tapTarget(card.owner, card.face, tapper)
  if (target.to === 'owner_settings') return to('/crew/card')

  const memberOwner = card.owner.kind === 'member' ? card.owner.profileId : null
  const sideEffects: Promise<unknown>[] = [logCardTap(card, 'open', tapper)]
  // Meeting someone counts only when the card shows something: a paused card is a lost card.
  if (target.to !== 'paused' && tapper && memberOwner && tapper !== memberOwner) {
    sideEffects.push(captureQrContact(tapper, memberOwner, { via: 'nfc_card' }), payCardConnect(tapper, memberOwner))
  }
  const creditOwner = target.to !== 'paused' && !tapper && !!memberOwner && (await referralsEnabled())
  // Every leg is fail-safe on its own; a slow or broken one never blocks the tap.
  await Promise.allSettled(sideEffects)

  let res: NextResponse
  if (target.to === 'page') res = to(target.path)
  else if (target.to === 'link') res = NextResponse.redirect(target.url, 307)
  else res = to(`/card/${encodeURIComponent(token)}`)

  if (creditOwner && memberOwner) {
    res.cookies.set(REF_COOKIE, memberOwner, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: REF_MAX_AGE })
  }
  res.headers.set('Cache-Control', 'no-store')
  return res
}
