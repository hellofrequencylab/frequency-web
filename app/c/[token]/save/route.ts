import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { logCardTap, memberCardsEnabled, resolveTappedCard } from '@/lib/member-cards/store'

export const dynamic = 'force-dynamic'

// /c/<token>/save (LIVE-1282, docs/LOYALTY.md "Member cards"): the Save contact button on a card's face.
// Counts one 'save' for the owner's numbers, then hands over the existing contact file: the member's
// opt-in vCard (/people/<handle>/vcard, which 404s unless they turned it on) or the Space's
// (/spaces/<slug>/vcard). A paused, revoked or unknown card counts nothing and saves nothing.
// The face links here with a plain <a>, so a prefetch never counts a save.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = new URL(request.url).origin
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin))
    res.headers.set('Cache-Control', 'no-store')
    return res
  }
  const { token } = await params
  if (!memberCardsEnabled()) return to('/code-unavailable')
  const card = await resolveTappedCard(token)
  if (!card) return to('/code-unavailable')
  if (card.face.paused) return to(`/card/${encodeURIComponent(token)}`)

  await logCardTap(card, 'save', await getMyProfileId())
  return to(
    card.owner.kind === 'member'
      ? `/people/${encodeURIComponent(card.owner.handle)}/vcard`
      : `/spaces/${encodeURIComponent(card.owner.slug)}/vcard`,
  )
}
