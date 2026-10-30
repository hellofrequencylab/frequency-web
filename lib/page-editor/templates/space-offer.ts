import type { Data } from '@/lib/page-editor/types'

// THE ONE-OFFER PAGE (LIVE-1938). A Space page that sells a single thing: the pitch, the offer with its price, a booking
// call to action and a closing question. It is made only of the Space profile blocks the page editor already has, so it
// opens in the same editor as every other Space page. Seeded from the Space's own first offering, never invented copy.
// The closing callout seeds with no link (ADR-1125): a button needs both a label and a destination. PURE + total.

type Block = { type: string; props: Record<string, unknown> }

export interface OfferSeed {
  title: string
  blurb?: string
  price?: number
  currency?: string
  durationMinutes?: number
}

const P = 'sp-offer'

export function generateOfferPage(spaceName: string, offer: OfferSeed): Data {
  const brand = spaceName.trim() || 'this space'
  const title = offer.title.trim()
  const blurb = (offer.blurb ?? '').trim()
  const content: Block[] = [
    { type: 'SpaceAbout', props: { id: `${P}-about`, eyebrow: `From ${brand}`, heading: title, body: blurb } },
    {
      type: 'SpaceOfferings',
      props: {
        id: `${P}-offer`,
        eyebrow: 'The offer',
        heading: title,
        items: [{ title, blurb, price: offer.price, currency: offer.currency, durationMinutes: offer.durationMinutes }],
      },
    },
    { type: 'SpaceBooking', props: { id: `${P}-booking`, heading: 'Save your spot', body: `Pick a time and ${brand} will hold your place.`, ctaLabel: 'Save my spot', accent: 'yes' } },
    { type: 'SpaceCallout', props: { id: `${P}-callout`, eyebrow: '', heading: 'Not sure yet?', body: 'Ask a question first. A real person answers.', ctaLabel: '', ctaHref: '', align: 'center' } },
  ]
  return { root: {}, content } as unknown as Data
}
