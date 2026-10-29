import type { KitPage } from '@/lib/sites/kits/types'
import { NETWORK_KIT_OFFERINGS } from '@/lib/sites/network-kit-home'
import { P, header, page } from './pages'

// THE NETWORK KIT INNER PAGES, pass B: Book, Shop and Resources (the library), as pages of Network blocks. PURE. The
// page header is the kit's shared NetworkKitHero; the service types are the shared NetworkKitOfferings in its `cards`
// layout; the shop is the shared NetworkKitShop in its `catalog` layout and the library the shared NetworkKitLibrary in
// its `table` layout; only the booking steps are an inner block (NetworkKitInnerBook, components/page-editor/blocks/
// network-kit-inner.tsx). Words follow the voice guide, not the design's demo copy: no price, rating, review or
// shipping promise, no "free", no count about a real group. The Book page's button reads the Space's own booking state,
// and the site serves its real booking page at /book once the Space has times open, so these cards are the page a
// Space without times shows. Products and resources are cards the owner types: the Space has no shop or library
// data of its own that the site pages can read. Photos are the kit's own.


export function networkKitBookPage(): KitPage {
  const service = (glyph: string, name: string, minutes: string, blurb: string): Record<string, unknown> => ({ glyph, name, minutes, blurb, price: '', href: '~/book' })
  return page('book', 'Book', 'Book a call with an organizer or a mentor.', [
    header('Book a call', 'Time with *a person*', 'A welcome call, a mentor session or a spotlight slot. Choose one, pick a time and you are booked.', 'photo-04'),
    { type: 'NetworkKitOfferings', props: { ...NETWORK_KIT_OFFERINGS, variant: 'cards', eyebrow: 'Choose', title: 'What would\n*help most?*', lead: '', actionLabel: '', actionHref: '', band: '', offerings: [
      service('circle', 'Welcome call', '20', 'A short call with an organizer. Tell us what you do and who you would like to meet; we will suggest a first meetup.'),
      service('target', 'Mentor session', '45', 'Time with a member who has done what you are doing. Bring one question and leave with next steps.'),
      service('spark', 'Business spotlight', '60', 'Present your business at a meetup, with a short slot and a feature for members.'),
    ] } },
    { type: 'NetworkKitInnerBook', props: {
      eyebrow: 'How booking works', title: 'Four short *steps*', lead: 'Choose a type of call, pick a time, add a few details and confirm. A booking can be moved from the email you get.', steps: 'Choose\nTime\nDetails\nConfirm', glyph: 'circle',
      asideTitle: 'Your booking', asideLabel: 'By video call', asideBody: 'Pick a type of call, then a time that suits you. A confirmation and the link come to your inbox.',
      facts: 'Choose a time that suits you\nShown in your own time zone\nThe video link is sent when you book\nA confirmation by email', policy: 'You can move a booking from your confirmation email.',
      buttonLabel: 'Pick a time', buttonHref: '~/book', offlineLabel: 'Ask for a time', offlineHref: '~/contact', band: 'sand',
    } },
  ])
}

export function networkKitShopPage(): KitPage {
  const product = (name: string, kind: string, photo: string, glyph = ''): Record<string, unknown> => ({ image: photo ? `${P}/${photo}.jpg` : '', glyph, name, kind, price: '', rating: '', href: '~/contact' })
  return page('shop', 'Shop', 'Tickets, kits and gifts.', [
    header('The shop', 'Tickets, kits *and gifts*', 'Summit tickets, the host kit for chapter leads, templates and gift memberships.', 'photo-11'),
    { type: 'NetworkKitShop', props: { variant: 'catalog', eyebrow: '', title: '', actionLabel: '', actionHref: '', allLabel: 'All', note: '', empty: 'Nothing is on the shelves yet. Check back soon, or say hello.', band: '', products: [
      product('The host kit', 'Objects', 'photo-07'),
      product('Summit day pass', 'Tickets', 'photo-10'),
      product('Chapter starter templates', 'Digital', '', 'file'),
      product('Conversation cards', 'Objects', 'photo-08'),
      product('Showcase recordings', 'Digital', '', 'video'),
      product('Gift membership', 'Gifts', '', 'gift'),
    ] } },
  ])
}

export function networkKitResourcesPage(): KitPage {
  const item = (glyph: string, type: string, title: string, meta: string): Record<string, unknown> => ({ glyph, type, title, meta, price: '', href: '~/contact' })
  return page('resources', 'Library', 'Guides, templates, stories and recordings.', [
    header('Library', 'Share what *works*', 'Host guides, templates, member stories and recordings, kept in one place.', 'photo-05'),
    { type: 'NetworkKitLibrary', props: { variant: 'table', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '', allLabel: 'All', search: 'Search the shelves', openLabel: 'Ask for it', openHref: '', empty: 'Nothing matches that. Try a shorter search, or clear the filter.', band: '', resources: [
      item('file', 'Guide', 'How to run a meetup people come back to', 'PDF'),
      item('file', 'Template', 'The chapter host checklist', 'Docs, Sheets, Notion'),
      item('video', 'Recording', 'Panel: keeping volunteers for years', 'Video'),
      item('file', 'Guide', 'Introductions that land: a five-line template', 'PDF'),
      item('file', 'Template', 'New member welcome emails', 'Docs'),
      item('video', 'Recording', 'Member showcase highlights', 'Video'),
      item('half', 'Story', 'Why small tables beat big rooms', 'A short read'),
      item('half', 'Story', 'What we learned when a chapter went quiet', 'A short read'),
    ] } },
  ])
}

/** Pass B, in menu order. */
export const networkKitInnerPagesB = (): KitPage[] => [networkKitBookPage(), networkKitShopPage(), networkKitResourcesPage()]

