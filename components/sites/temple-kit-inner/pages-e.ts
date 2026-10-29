import type { KitPage } from '@/lib/sites/kits/types'

// THE TEMPLE KIT INNER PAGES, group E: Book, as a page of TempleKitInner blocks plus the shared SpaceBooking block.
// PURE. The design's BookPage is a booking engine; the site already serves the Space's real booking page at /book
// once the Space has times open, so this page is what leads there: the session types as service rows, the shared
// booking button (it reads the Space's own booking state and draws nothing while bookings are off) and the questions
// people ask first. Session names, lengths and words are typed values the Space edits. No price is seeded.
// Role and variant: TempleKitInnerService = the shared service row (one per session type); SpaceBooking = the shared
// booking call to action; TempleKitInnerFaq = the shared questions block.

type Block = KitPage['blocks'][number]

const page = (slug: string, label: string, description: string, blocks: Block[]): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

export function templeKitBookPage(): KitPage {
  return page('book', 'Book', 'Book a call, a session or a walk of the grounds.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'Book a session', title: 'What would *help most?*', lead: 'A first call, a private session or a walk of the grounds. Choose one, pick a time and you are booked.' } },
    { type: 'TempleKitInnerService', props: {
      eyebrow: 'By video call', title: 'A first call', sigil: 'circle', side: 'left', ctaLabel: 'Pick a time', ctaHref: '~/book', note: '20 minutes',
      lead: 'A short call with the keeper of the house. Tell us what you are looking for and we will suggest where to begin.',
      points: 'A quiet start, with no preparation needed\nThe video link comes with your confirmation\nMove it from the email if plans change',
    } },
    { type: 'TempleKitInnerService', props: {
      eyebrow: 'In the rooms', title: 'A private session', sigil: 'triangle', side: 'right', ctaLabel: 'Pick a time', ctaHref: '~/book', note: '60 minutes',
      lead: 'One hour of breath, sound or healing work, held for you alone in the studio.',
      points: 'Come a little early and take your shoes off at the door\nTea after, if you would like it\nTell us before you arrive if anything needs care',
    } },
    { type: 'TempleKitInnerService', props: {
      eyebrow: 'On the grounds', title: 'A walk of the grounds', sigil: 'square', side: 'left', ctaLabel: 'Ask for a time', ctaHref: '~/contact', note: '45 minutes',
      lead: 'For weddings, retreats and room hire. We walk the house together before you decide anything.',
      points: 'See the great room, the lawn and the long table\nBring your questions and the people you plan with\nAny date can be held while you decide',
    } },
    { type: 'SpaceBooking', props: { heading: 'Ready when you are', body: 'Choose a time that suits you. A confirmation and the video link come to your inbox.', ctaLabel: 'Pick a time' } },
    { type: 'TempleKitInnerFaq', props: { title: 'About *booking*', items: [
      { q: 'Can I move a booking?', a: 'Yes. Your confirmation email has a link to move or cancel it.' },
      { q: 'What do I need to bring?', a: 'Nothing for a call. For a session, comfortable clothes and a little time to arrive.' },
      { q: 'Can I bring someone with me?', a: 'Tell us when you book and we will make room.' },
    ] } },
  ])
}

/** Group E, in menu order. */
export const templeKitInnerPagesE = (): KitPage[] => [templeKitBookPage()]
