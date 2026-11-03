// VANTA EXTERIOR SERVICES, ON THE SERVICES THEME. PURE: the business's four pages as Services blocks, so the seed script
// and the tests share one source. The words are the Vanta design system's own (handoff "Vanta", ui_kits/site/record.js,
// Sections.jsx, Services.jsx, About.jsx, Quote.jsx), which is the origin point of the Services theme: Vanta is the
// business the theme was drawn for, so its Space wears `services` with the Tide accent (#1AA7C0) and nothing else.
//
// Content rules from the handoff: affirmative voice only, no prices or tiers (every service says "Free quote"), the only
// quote is Aiden's own until real reviews exist, no exclamation marks or emoji. The phone and email are the design's own
// record (`SITE`); the owner replaces them in the editor. Links starting `~/` are pages of this site.

import type { WebsiteEditorState, WebsiteSnapshot } from '@/lib/sites/editor/state'

export const VANTA_SLUG = 'vanta'
const IMG = '/sites/vanta'

export const VANTA = {
  name: 'Vanta',
  full: 'Vanta Exterior Services',
  owner: 'Aiden Tyack',
  descriptor: 'Window & solar cleaning · North County',
  tagline: 'Window and solar panel cleaning for homes and small businesses along the North County coast.',
  phone: '760·555·0142',
  tel: '7605550142',
  email: 'hello@govanta.pro',
  hours: 'Mon–Sat · 7a–5p',
  city: 'North County, CA',
  hero: `${IMG}/hero-window-wash.webp`,
} as const

/** Tide, the Services theme's own accent (lib/theme/services.ts SERVICES_ACCENTS.tide). Stored brand data, not a UI colour. */
export const VANTA_ACCENT = '#1AA7C0' // token-ok: the stored brand accent is data, Tide (lib/theme/services.ts)

const HOODS = ['Oceanside', 'Carlsbad', 'Encinitas', 'Cardiff', 'Solana Beach', 'Del Mar', 'San Marcos', 'Vista']

type Block = { type: string; props: Record<string, unknown> }
interface VantaPageSeed { slug: string; title: string; seo: { title: string; description: string }; blocks: Block[] }
const b = (type: string, props: Record<string, unknown>): Block => ({ type, props })

const QUOTE = '~/quote'
const SERVICES = '~/services'
const ABOUT = '~/about'

const band = (eyebrow: string, title: string): Block =>
  b('ServicesBand', { eyebrow, title, primaryLabel: 'Get a free quote', primaryHref: QUOTE, secondaryLabel: '', secondaryHref: '' })

const home = (): Block[] => [
  b('ServicesHero', {
    look: 'photo', eyebrow: 'North County / San Diego', title: 'Let the light *back in.*',
    lead: 'Window and solar panel cleaning for homes and small businesses along the coast. Owner-operated, done by hand, done right.',
    primaryLabel: 'Get a free quote', primaryHref: QUOTE, secondaryLabel: 'Meet Aiden', secondaryHref: ABOUT, proof: '',
    image: VANTA.hero, alt: 'A window being washed in the morning light',
    panelTitle: 'Services', panelNote: 'Two stories · Small commercial',
    offers: [
      { name: 'Window washing', meta: 'Interior & exterior glass', price: 'Free quote', href: SERVICES },
      { name: 'Solar panels', meta: 'Pure-water rinse, soft brush', price: 'Free quote', href: SERVICES },
    ],
    areas: HOODS,
  }),
  b('ServicesTrust', {
    items: [
      { title: 'Owner-operated', line: 'The same person, every visit' },
      { title: 'Pure-water rinse', line: 'A clear, spotless finish' },
      { title: 'Two stories', line: 'Homes and condos' },
      { title: 'Free quotes', line: 'Usually same day' },
    ],
  }),
  b('ServicesStory', {
    eyebrow: 'Why Vanta', title: 'Focused on glass. *Serious about detail.*',
    paragraphs: [
      'Vanta specializes in windows and solar panels. Every job gets the full treatment, from the glass to the frames, tracks, sills and screens around it.',
      'The person who quotes your job is the person who shows up to do it.',
    ],
    buttonLabel: 'Meet the founder', buttonHref: ABOUT, image: '', alt: '',
  }),
  b('ServicesList', {
    eyebrow: 'Services', title: 'Two services. *Done well.*', lede: 'Every window visit includes the glass, frames, tracks, sills and screens.',
    buttonLabel: 'Service details', buttonHref: SERVICES,
    rows: [
      { meta: 'Glass', name: 'Window washing', body: 'Inside and out, finished by hand. Frames wiped, tracks cleared, sills detailed and screens washed on every visit.', price: 'Free quote', href: SERVICES },
      { meta: 'Solar', name: 'Solar panels', body: 'A pure-water rinse and soft brush that lifts salt, dust and pollen so your panels see the sun again.', price: 'Free quote', href: SERVICES },
      { meta: 'Capabilities', name: 'Two stories and small commercial', body: 'Homes, townhomes and condos with glass on the first and second floor, plus storefronts, offices and studios on a regular schedule.', price: 'Free quote', href: SERVICES },
    ],
  }),
  b('ServicesSteps', {
    eyebrow: 'How it works', title: 'Four steps. *Every time.*', lede: '',
    rows: [
      { title: 'Walk-through', body: 'We look at every window and panel with you and plan the visit.' },
      { title: 'Rinse', body: 'Pure water lifts salt and dust and protects the glass.' },
      { title: 'Detail by hand', body: 'Glass, frames, tracks, sills and screens. Every edge, every time.' },
      { title: 'Final check', body: 'We walk it again together and finish once you love it.' },
    ],
  }),
  b('ServicesFaq', {
    eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Anything else, call or text. Aiden answers.',
    rows: [
      { question: 'What comes with a window wash?', answer: 'Interior and exterior glass, plus frames, tracks, sills and screens. All of it comes standard.' },
      { question: 'How tall can you go?', answer: 'Two stories. That covers most homes, townhomes and condos in North County.' },
      { question: 'Do you clean businesses?', answer: 'Yes. Small storefronts, offices and studios, either once or on a regular schedule.' },
      { question: 'Do I need to be home?', answer: 'For interior windows, yes. For exterior work, leave a gate code and we will text when we arrive and when we leave.' },
      { question: 'How often should coastal windows be cleaned?', answer: 'Every three months works for most homes near the water. Solar panels usually need a rinse two to four times a year.' },
    ],
    facts: [{ label: VANTA.phone }, { label: 'Text anytime' }, { label: VANTA.hours }],
    areas: HOODS,
  }),
  band('Free quotes', 'Clear glass *by the weekend.*'),
]

const services = (): Block[] => [
  b('ServicesHero', {
    look: 'minimal', eyebrow: 'Services', title: 'Windows and solar. *At full power.*',
    lead: 'Your home already runs on sunshine. It pours through the windows, warms the rooms and charges the panels on the roof. All it needs is a clear path in. That part is ours.',
    primaryLabel: 'Get a free quote', primaryHref: QUOTE, secondaryLabel: '', secondaryHref: '', proof: '', image: '', alt: '',
    panelTitle: '', panelNote: '', offers: [], areas: [],
  }),
  b('ServicesStory', {
    eyebrow: 'Glass', title: 'Let the sun *all the way in.*',
    paragraphs: [
      'Clean glass is the easiest upgrade a home can get. Mornings come in brighter, the ocean looks a little closer, and every room picks up that just-moved-in glow. We do the whole window, so the light has nothing in its way.',
      'Interior and exterior glass. Frames wiped down. Tracks cleared. Sills detailed. Screens washed.',
    ],
    buttonLabel: 'Get a free quote', buttonHref: QUOTE, image: VANTA.hero, alt: 'Window washing in the morning light',
  }),
  b('ServicesStory', {
    eyebrow: 'Solar', title: 'Free power, *fully charged.*',
    paragraphs: [
      'Your panels have one job: catch the sun. A thin film of salt and dust quietly gets in the way. A pure-water rinse and a soft brush bring them back to showroom shine, so every bright afternoon pays you back in full.',
      'Pure-water rinse. Soft-bristle brush. Gentle, plant-safe cleaning. Home and small business arrays.',
    ],
    buttonLabel: 'Get a free quote', buttonHref: QUOTE, image: '', alt: '',
  }),
  b('ServicesBand', { eyebrow: 'Book both · one visit', title: 'One sun. Two ways to *soak it up.*', primaryLabel: 'Get a free quote', primaryHref: QUOTE, secondaryLabel: '', secondaryHref: '' }),
  b('ServicesList', {
    eyebrow: 'Capabilities', title: 'Built for *your place.*', lede: 'Sparkling windows bring the light inside. Clean panels turn it into power. Same morning, same person.',
    buttonLabel: 'Get a free quote', buttonHref: QUOTE,
    rows: [
      { meta: 'Homes', name: 'Two stories', body: 'Homes, townhomes and condos with glass on the first and second floor.', price: 'Free quote', href: QUOTE },
      { meta: 'Business', name: 'Small commercial', body: 'Storefronts, offices and studios on a regular schedule.', price: 'Free quote', href: QUOTE },
    ],
  }),
  band('Free quotes', 'Clear glass *by the weekend.*'),
]

const about = (): Block[] => [
  b('ServicesHero', {
    look: 'minimal', eyebrow: 'About / Founder', title: 'Started by hand. *Built on detail.*',
    lead: `Vanta is ${VANTA.owner}'s company. He quotes every job, shows up to every job and does the work himself.`,
    primaryLabel: 'Get a free quote', primaryHref: QUOTE, secondaryLabel: 'See services', secondaryHref: SERVICES, proof: '', image: '', alt: '',
    panelTitle: '', panelNote: '', offers: [], areas: ['Owner-operated', 'North County coast', 'Two stories'],
  }),
  b('ServicesStory', {
    eyebrow: 'The story', title: 'One street *at a time.*',
    paragraphs: [
      'Aiden grew up on the North County coast, where salt air and afternoon sun leave a haze on every window. He saw that a truly clean window is more than the glass: it is the frames, the tracks, the sills and the screens that frame the view.',
      'So he started doing it completely. A bucket, a squeegee, a few neighbors who were willing to give him a shot. Frames wiped, tracks cleared, screens washed, sills finished. People noticed, and word spread one street at a time.',
      'That is still how Vanta works. Windows and solar panels, each done in full detail, for every home and storefront. The name comes from the view on the other side of the glass: the light, the coastline, the reason you picked the place.',
    ],
    buttonLabel: '', buttonHref: '', image: '', alt: '',
  }),
  b('ServicesBand', { eyebrow: `In his words · ${VANTA.owner}, Founder`, title: 'I want people to look out the window and see the whole *coastline.*', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '' }),
  b('ServicesSteps', {
    eyebrow: 'What you can count on', title: 'Three *promises.*', lede: '',
    rows: [
      { title: 'Show up when I say I will', body: 'Your time matters. You get a real arrival window and a text when I am on the way.' },
      { title: 'Treat it like my own home', body: 'Shoes off inside, drop cloths down, plants rinsed. You see clear glass and a tidy home.' },
      { title: 'Do it right, or do it again', body: 'Every pane and track is backed by a free return visit if anything needs another touch.' },
    ],
  }),
  band('Free quotes', 'Clear glass *by the weekend.*'),
]

const quote = (): Block[] => [
  b('ServicesQuote', {
    eyebrow: 'Free quote', title: 'Tell us about *your place.*', lede: 'Three quick steps. Aiden replies with your quote, usually the same day.',
    image: VANTA.hero, alt: 'A window being washed in the morning light',
    services: ['Window washing', 'Solar panels'],
    frequencies: ['One time', 'Quarterly', 'Let us plan it'],
    propertyTypes: ['Single-story home', 'Two-story home', 'Townhome or condo', 'Small business'],
    sizes: ['Under 15', '15 to 30', '30 to 50', '50 or more', 'Not sure'],
    submitLabel: 'Send request', successTitle: 'You are on the books.',
    successBody: 'Aiden will call or text within one business day to confirm your visit and a firm price.',
  }),
  b('ServicesLocations', {
    eyebrow: 'Reach Aiden', title: 'Call, text *or write.*', lede: 'Aiden answers.',
    address: VANTA.city, phone: VANTA.phone, email: VANTA.email,
    hours: [{ day: 'Mon–Sat', hours: '7a–5p' }], areas: HOODS, image: '', alt: '',
  }),
]

/** The business's whole site: Home, Services, About and the quote page. */
export function vantaSitePages(): VantaPageSeed[] {
  return [
    { slug: 'home', title: 'Home', seo: { title: 'Vanta Exterior Services | Window & solar cleaning in North County', description: VANTA.tagline }, blocks: home() },
    { slug: 'services', title: 'Services', seo: { title: 'Window washing and solar panel cleaning', description: 'Windows and solar, done by hand: glass, frames, tracks, sills, screens and a pure-water rinse. Free quotes.' }, blocks: services() },
    { slug: 'about', title: 'About', seo: { title: 'About Aiden Tyack and Vanta', description: 'Vanta is an owner-operated window and solar cleaning company on the North County coast.' }, blocks: about() },
    { slug: 'quote', title: 'Free quote', seo: { title: 'Get a free quote', description: 'Tell Vanta about your place. Aiden replies with your quote, usually the same day.' }, blocks: quote() },
  ]
}

/** The saved Space menu the site's header draws, as the design's header has it: About, Services, How it works and FAQ (the last two
 *  are sections of Home). Home is the wordmark and the quote is the header's button. */
export const VANTA_MENU = {
  v: 1 as const,
  items: [
    { id: 'about', label: 'About', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:about' } },
    { id: 'services', label: 'Services', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:services' } },
    { id: 'process', label: 'How it works', visibility: 'website' as const, target: { kind: 'url' as const, href: '/#process' } },
    { id: 'faq', label: 'FAQ', visibility: 'website' as const, target: { kind: 'url' as const, href: '/#faq' } },
  ],
  known: ['home', 'services', 'about', 'quote'].map((k) => `page:${k}`),
}

/** The footer the design sets: a closing line with the quote button, three columns, the copyright and the owner line. */
export const VANTA_FOOTER = {
  blurb: VANTA.descriptor,
  copyright: '© 2026 Vanta Exterior Services',
  line: 'Owner-operated · North County',
  columns: [
    { title: 'Services', links: [{ label: 'Window washing', href: '/services' }, { label: 'Frames & tracks', href: '/services' }, { label: 'Sills & screens', href: '/services' }, { label: 'Solar panels', href: '/services' }] },
    { title: 'Company', links: [{ label: 'About Aiden', href: '/about' }], lines: ['Two stories', 'Small commercial', 'North County coast'] },
    { title: 'Contact', links: [{ label: VANTA.phone, href: `tel:${VANTA.tel}` }, { label: VANTA.email, href: `mailto:${VANTA.email}` }], lines: [VANTA.hours, VANTA.city] },
  ],
  band: { title: 'Clear glass, *every visit.*', ctas: [{ label: 'Get a free quote', href: '/quote' }] },
}

/** The published website state the editor stores: every page's blocks with stable ids, no comments, one version. */
export function vantaEditorState(now: string): WebsiteEditorState {
  const pages = vantaSitePages().map((p) => ({
    slug: p.slug,
    label: p.title,
    seo: { ...p.seo },
    comments: [],
    doc: { root: {}, content: p.blocks.map((blk, n) => ({ type: blk.type, props: { ...structuredClone(blk.props), id: `vanta-${p.slug}-${n + 1}` } })) },
  }))
  const snapshot: WebsiteSnapshot = {
    theme: 'Services',
    brand: { accent: VANTA_ACCENT },
    chrome: { name: VANTA.name, tagline: VANTA.descriptor, cta: { label: 'Free quote', href: '/quote' } },
    pages,
  }
  return { v: 1, revision: 1, draft: snapshot, published: structuredClone(snapshot), versions: [{ id: '1', createdAt: now, author: 'Frequency', snapshot: structuredClone(snapshot) }] }
}
