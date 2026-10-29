import type { KitPage } from '@/lib/sites/kits/types'
import { NETWORK_KIT_CTA, NETWORK_KIT_FAQ, NETWORK_KIT_HERO } from '@/lib/sites/network-kit-home'
import { NETWORK_KIT_CHAPTERS, NETWORK_KIT_CIRCLES } from '@/lib/sites/network-kit-extras'

// THE NETWORK KIT INNER PAGES, pass A: About, Services, Workshops (meetups) and Journeys (programs), as pages of
// Network blocks. PURE. The page header, the figures, the chapters and circles, the questions and the closing call
// are the kit's shared blocks (NetworkKitHero, NetworkKitStats, NetworkKitChapters, NetworkKitCircles, NetworkKitFAQ,
// NetworkKitCTA); the story, organizers, service rows and filtered index are the NetworkKitInner blocks
// (components/page-editor/blocks/network-kit-inner.tsx). Words follow the voice guide, not the design's demo copy: no
// number about a real group (members, seats, prices, years, lessons), no day or rhythm, no "free" promise, "group" not
// "cohort", and no prompt left for the owner. The figures read the Space's own counts; the meetups and programs read
// its own events and programs, and these cards are only the empty state. Photos are the kit's own.

type Block = KitPage['blocks'][number]

const P = '/sites/network-kit/photos'
const page = (slug: string, label: string, description: string, blocks: Block[]): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

/** The design's PageHero: eyebrow, headline and intro on the left, the leaf-cropped photo on the right. No buttons. */
const header = (eyebrow: string, title: string, lead: string, photo: string): Block => ({
  type: 'NetworkKitHero',
  props: { ...NETWORK_KIT_HERO, variant: 'split', flip: false, eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: `${P}/${photo}.jpg`, showEvent: false },
})

/** The design's CtaBand: a card with the line and one button. */
const closing = (): Block => ({
  type: 'NetworkKitCTA',
  props: { ...NETWORK_KIT_CTA, variant: 'card', eyebrow: 'Your first visit', title: 'Come once. *Bring a friend.*', buttonLabel: 'See the next meetup', buttonHref: '~/workshops', secondaryLabel: '', secondaryHref: '', image: '' },
})

export function networkKitAboutPage(): KitPage {
  return page('about', 'About', 'Who we are and how the group began.', [
    header('Our story', 'Built by members, *for members*', '', 'photo-10'),
    { type: 'NetworkKitInnerStory', props: {
      eyebrow: 'How it started', title: 'Networking, *minus the awkward*', image: `${P}/photo-03.jpg`, alt: '', caption: 'A first morning in the courtyard',
      body: '{{story|Nobody wanted another room of business cards and elevator pitches.\nSo we sat at small tables, introduced people on purpose and asked one question: who can you help? People came back. Then they brought friends.\nThe rule has stayed the same: show up, be useful, and business follows.}}',
      band: '',
    } },
    { type: 'NetworkKitChapters', props: { ...NETWORK_KIT_CHAPTERS } },
    { type: 'NetworkKitCircles', props: { ...NETWORK_KIT_CIRCLES, band: '' } },
    { type: 'NetworkKitInnerTeam', props: { label: 'The organizers', band: '', people: [
      { name: '{{person1Name|Alex Morgan}}', role: 'Founder', line: '{{person1Line|Hosts the mornings · makes the introductions}}' },
      { name: '{{person2Name|Jordan Reyes}}', role: 'Organizer', line: '{{person2Line|Welcomes new members · runs the directory}}' },
      { name: '{{person3Name|Kim Sato}}', role: 'Chapters', line: '{{person3Line|Trains hosts · opens new chapters}}' },
    ] } },
    { type: 'NetworkKitStats', props: { variant: 'photo', image: `${P}/photo-07.jpg`, alt: '', items: [], band: '' } },
    closing(),
  ])
}

export function networkKitServicesPage(): KitPage {
  const row = (title: string, glyph: string, length: string, photo: string, summary: string, points: string, price: string, ctaLabel: string): Record<string, unknown> =>
    ({ image: `${P}/${photo}.jpg`, alt: '', glyph, length, title, summary, points, ctaLabel, ctaHref: '~/contact', price })
  return page('services', 'Services', 'Ways to join, from a first visit to starting a chapter.', [
    header('Ways to join', 'Start small. *Stay for years.*', 'Every way in starts with a first visit. Come to a meetup, get introduced, or bring the format to your own town.', 'photo-08'),
    { type: 'NetworkKitInnerServices', props: { band: '', rows: [
      row('Visit a meetup', 'ring', 'A first visit', 'photo-08', 'Coffee, a short welcome, then small tables. A host introduces you to people whose work overlaps with yours.', 'A seat at a small table with a host\nIntroductions made on purpose\nThe guest list by email the next morning', '', 'Enquire'),
      row('Get introduced', 'target', 'Through an organizer', 'photo-05', 'Tell us who you want to meet. An organizer looks through the directory and sends a warm, two-way introduction.', 'A short note on who you want to meet\nA two-way introduction by email\nA check-in a month later', 'Included with membership', 'Enquire'),
      row('Start a chapter', 'nodes', 'By application', 'photo-02', 'Bring the format to your town. We train you as a host, help you find a venue and fill the first table.', 'Host training and the playbook\nA mentor host for your first season\nListing, RSVPs and check-in from day one', '', 'Enquire'),
    ] } },
    { type: 'NetworkKitFAQ', props: { ...NETWORK_KIT_FAQ, variant: 'split', eyebrow: '', title: 'Common *questions*', side: '', band: '', items: [
      { q: 'Who do you work with?', a: 'Business owners, freelancers, professionals and creatives who would rather meet people than collect cards. Not a fit if you are here to pitch.' },
      { q: 'Do you work remotely?', a: 'Mostly in person, with chapters in nearby towns and online welcome calls for people further away.' },
      { q: 'How do I know which one fits?', a: 'Start with a welcome call. We will say plainly if we are not the right fit.' },
    ] } },
    closing(),
  ])
}

export function networkKitWorkshopsPage(): KitPage {
  const card = (title: string, group: string, photo: string, meta: string, body: string): Record<string, unknown> => ({ image: `${P}/${photo}.jpg`, eyebrow: group, title, meta, body, price: '', note: '', group, href: '~/contact' })
  return page('workshops', 'Meetups', 'The mornings, the evenings and the specials.', [
    header('Meetups', 'When we *meet*', 'The morning meetup, the evening mixer and the specials. Members RSVP in one tap.', 'photo-07'),
    { type: 'NetworkKitInnerIndex', props: { variant: 'meetups', countNoun: 'upcoming', allLabel: 'All', tabs: 'Online\nIn person', image: `${P}/photo-07.jpg`, alt: '', count: 12, empty: 'No dates are up yet. Check back soon, or say hello.', band: '', items: [
      card('The morning meetup', 'In person', 'photo-07', 'The courtyard', 'Coffee, small tables and one member sharing what they are working on.'),
      card('Members evening mixer', 'In person', 'photo-11', 'The rooftop', 'A relaxed evening with a host on the floor making introductions. Bring a colleague.'),
      card('New member welcome', 'Online', 'photo-04', 'Online', 'Meet the organizers, learn how introductions work and set up your directory profile.'),
      card('Member showcase', 'In person', 'photo-10', 'The courtyard', 'A few members, a few minutes each, then open tables. The best way to learn who is in the room.'),
    ] } },
  ])
}

export function networkKitJourneysPage(): KitPage {
  const card = (title: string, eyebrow: string, group: string, photo: string, body: string): Record<string, unknown> => ({ image: `${P}/${photo}.jpg`, eyebrow, title, meta: '', body, price: '', note: group === 'Runs' ? 'Runs with a group' : 'Self-paced', group, href: '~/contact' })
  return page('journeys', 'Programs', 'Host training, onboarding and chapter programs.', [
    header('Programs', 'Grow with *a group*', 'Host training, onboarding and chapter programs. Each one runs for a set number of weeks with a small group that starts together.', 'photo-01'),
    { type: 'NetworkKitInnerIndex', props: { variant: 'programs', countNoun: 'programs', allLabel: 'All', tabs: 'Runs\nSelf-paced', image: `${P}/photo-01.jpg`, alt: '', count: 12, empty: 'No programs are up yet. Check back soon, or say hello.', band: '', items: [
      card('Host training: run a meetup people come back to', 'Hosting', 'Runs', 'photo-01', 'By the end, you can welcome a room, seat small tables and make introductions that lead somewhere.'),
      card('Your first months as a member', 'Onboarding', 'Self-paced', 'photo-05', 'You know who is in the room, have a few people to call and a reason to keep coming.'),
      card('Grow a chapter', 'Chapters', 'Runs', 'photo-02', 'A plan for venue, rhythm, volunteers and the first invitations.'),
      card('The introduction habit', 'Connection', 'Self-paced', 'photo-08', 'A short program: make one useful introduction a day.'),
    ] } },
  ])
}

/** Pass A, in menu order. */
export const networkKitInnerPagesA = (): KitPage[] => [networkKitServicesPage(), networkKitWorkshopsPage(), networkKitJourneysPage(), networkKitAboutPage()]
