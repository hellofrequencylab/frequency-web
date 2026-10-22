import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { tapTarget } from '@/lib/member-cards/face'
import { memberCardsEnabled, resolveTappedCard } from '@/lib/member-cards/store'
import { OutboundHop } from './outbound-hop'

// /card/<token>/go: the hop a member card takes to ANOTHER site (LIVE-1298). /c/<token> counts the tap and
// sends a link to anywhere but Frequency here, and this Frequency page opens the site. Closing that site
// then lands back on Frequency: the installed app's in-app window closes onto this page, and so does Back
// in a browser, and the page sends the visitor on to Frequency's home instead of opening the site again.
// It counts nothing itself (the tap was counted on /c). A card that no longer opens another site goes to
// its own face page, which sends the visitor wherever the card now points.

export const metadata: Metadata = {
  title: 'Opening link',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function CardGoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ n?: string }>
}) {
  if (!memberCardsEnabled()) redirect('/code-unavailable')
  const [{ token }, { n }] = await Promise.all([params, searchParams])
  const card = await resolveTappedCard(token)
  if (!card) redirect('/code-unavailable')
  const target = tapTarget(card.owner, card.face, await getMyProfileId())
  if (target.to !== 'link') redirect(`/card/${encodeURIComponent(token)}`)
  const nonce = typeof n === 'string' && /^[0-9a-f]{8}$/.test(n) ? n : null
  return <OutboundHop url={target.url} nonce={nonce} />
}
