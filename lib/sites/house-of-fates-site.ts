// HOUSE OF FATES, ON MIDNIGHT (the House of Fates design handoff, Hypnotist kit, 2026-10). PURE: the practice's pages
// as Midnight blocks, so the update script and the tests share one source. The words are Toni Pitruzzello's own, from
// houseoffates.co (lib/sites/house-of-fates-content.ts), with two typos and one em dash fixed. The photos are hers,
// served from /sites/house-of-fates/. Home, Services, Hypnosis Library, Group Programs, Events, Newsletter, About and
// Contact are pages of this site; /book is the site's own booking page once the Space takes bookings.
//
// Links start with `~/` for a page of this site. Wrap words in *stars* to set them in the italic.

import type { WebsiteEditorState, WebsiteSnapshot } from '@/lib/sites/editor/state'
import {
  HOF_CUSTOM, HOF_FAQS, HOF_IMG, HOF_PROGRAMS, HOF_RECORDINGS, HOF_SERVICE_TYPES, HOF_SESSIONS,
} from './house-of-fates-content.ts'

/** The Space's address name: house-of-fates.frequencylocal.com. */
const HOF_SLUG = 'house-of-fates'
const i = (name: string) => `${HOF_IMG}/${name}`

/** Flip to true once Toni's weekly hours are saved on the Space: the Space then serves /book, and every "Book" button
 *  goes there. Until then they open the contact page, which always exists. */
export const HOF_BOOKING_LIVE = false
const BOOK = HOF_BOOKING_LIVE ? '~/book' : '~/contact-us'

export const HOUSE_OF_FATES = {
  name: 'House of Fates',
  tagline: 'Hypnosis, Reiki, Sound Healing',
  line: 'Unleash your inner magic with HypnoReiki.',
  city: 'In person & virtual',
  zone: 'PT',
  logo: i('logo.png'),
} as const

interface BlockSeed { type: string; props: Record<string, unknown> }
interface HofPageSeed { slug: string; title: string; nav: boolean; seo: { title: string; description: string }; blocks: BlockSeed[] }

const b = (type: string, props: Record<string, unknown>): BlockSeed => ({ type, props })
const money = (n: number) => (n === 0 ? 'Free' : `$${n.toLocaleString('en-US')}`)
const sentence = (t: string) => `${t.split('. ')[0]}.`.replace(/\.\.$/, '.')

const recordingItems = (list = HOF_RECORDINGS) =>
  list.map((r) => ({ sigil: r.glyph, title: r.title, price: money(r.price), blurb: r.blurb, points: r.points.join('\n'), buttonLabel: 'Get this recording', href: '~/contact-us' }))

const PILLARS = [
  { sigil: 'star', title: 'Crafted just for you', body: 'Custom designed sessions tailored to your specific needs, ensuring optimal results' },
  { sigil: 'fire', title: 'Claim your power', body: 'Access the tools and guidance to transcend barriers and unleash your aligned power.' },
  { sigil: 'moon-quarter', title: 'Flexibility', body: 'Choose between in-person or virtual sessions, seamlessly integrated into your lifestyle.' },
  { sigil: 'saturn', title: 'Comprehensive', body: 'Harnessing the transformative synergy of Reiki and Hypnotherapy, guiding you on a holistic journey to self-healing and empowerment.' },
]

const pillars = (eyebrow: string, title: string) => b('MidnightPillars', { eyebrow, title, lead: '', pillars: PILLARS })
const band = (title: string, buttonLabel = 'Book a free consultation', buttonHref = BOOK) => b('MidnightBand', { title, buttonLabel, buttonHref })
const pageHero = (eyebrow: string, title: string, lead: string, image: string, height = 460) =>
  b('MidnightPageHero', { eyebrow, title, lead, image: i(image), alt: '', pos: '', height })
const customPanel = () => ({
  panelSigil: 'mic', panelMeta: `${HOF_CUSTOM.meta} · recorded for you`, panelTitle: 'Custom hypnosis *recording*', panelBody: HOF_CUSTOM.body,
  panelButtonLabel: 'Get my 20 min hypnosis audio', panelButtonHref: '~/contact-us', panelPrice: money(HOF_CUSTOM.price),
})
const recordingPanel = () => b('MidnightCustomRecording', { sigil: 'mic', meta: `${HOF_CUSTOM.meta} · recorded for you`, title: 'Custom hypnosis *recording*', body: HOF_CUSTOM.body, buttonLabel: 'Get my 20 min hypnosis audio', buttonHref: '~/contact-us', price: money(HOF_CUSTOM.price) })

/** Width per block on the home page: content sits in a tight centred column, the bands run edge to edge. */
const HOME_FRAMES: Record<string, 'column' | 'full'> = {
  MidnightWelcome: 'column', MidnightOfferings: 'column', MidnightHost: 'column', MidnightJourneys: 'column',
  MidnightGatherings: 'column', MidnightRecordings: 'column', MidnightPillars: 'full', MidnightFAQ: 'column', MidnightLetter: 'column', MidnightCTA: 'full',
}
const framed = (blocks: BlockSeed[]): BlockSeed[] => blocks.map((x) => (HOME_FRAMES[x.type] ? b(x.type, { ...x.props, frame: HOME_FRAMES[x.type] }) : x))

const home = (): BlockSeed[] => framed([
  b('MidnightHero', {
    layout: 'left', eyebrow: HOUSE_OF_FATES.tagline, title: 'Step into your\n*empowerment odyssey.*', lead: HOUSE_OF_FATES.line,
    primaryLabel: 'Book a free consultation', primaryHref: BOOK, secondaryLabel: 'Explore services', secondaryHref: '~/services',
    image: i('hero-dunes.jpg'), alt: '', pos: 'center 40%', tone: 'soft',
  }),
  b('MidnightLive', {
    items: [
      { source: 'custom', sigil: 'calendar-clock', label: 'Free consultation', value: 'Openings this week', href: BOOK },
      { source: 'custom', sigil: 'moon-new', label: 'Hypnotic Sound', value: 'Live on Frequency', href: '~/hypnotic-sound' },
      { source: 'custom', sigil: 'moon-waxing', label: 'Group programs', value: 'Better Sleep · enrolling', href: '~/group-programs' },
      { source: 'custom', sigil: 'mail', label: 'Newsletter', value: 'Monthly, from Toni', href: '~/newsletter' },
    ],
  }),
  b('MidnightWelcome', {
    logo: HOUSE_OF_FATES.logo, logoAlt: HOUSE_OF_FATES.name, eyebrow: HOUSE_OF_FATES.tagline, title: 'Welcome to *the magic*',
    lead: 'Step into the transformative magic of HypnoReiki, uniquely blending the wisdom of Reiki with the science of Hypnosis to guide you towards profound peace and rejuvenation. Here, every session is a step closer to your truest self, your highest fate. Supported by the expert hands of Toni Pitruzzello, you’ll create greater ease to embrace the odyssey; embrace the magic within.',
    image: i('dreamscape.jpg'), alt: '', tone: 'soft', heading: 'Discover the Power Within to Transform Your Life',
    body: 'Life’s challenges are no match for your inner magic! With a personalized HYPNOSIS, REIKI or HYPNOREIKI session, you can reclaim your power, find clarity, and conquer stress.\n\nI offer custom packages tailored to your unique desires so you can break free from limiting patterns and ignite your true potential. Step into your strength, embrace your authenticity, and experience profound, lasting transform.',
    buttonLabel: 'Book a free consultation', buttonHref: BOOK,
  }),
  b('MidnightOfferings', {
    eyebrow: 'Services', title: 'Your voyage to *inner liberation*',
    lead: 'Ready to embark on your inner odyssey to liberation? Schedule your session today and explore our transformative services below.',
    actionLabel: 'All services', actionHref: '~/services',
    offerings: HOF_SERVICE_TYPES.map((s) => ({ sigil: s.sigil, name: s.name, minutes: String(s.minutes), blurb: s.blurb, price: money(s.price), href: BOOK })),
  }),
  b('MidnightHost', {
    eyebrow: 'Reiki Master Teacher, Clinical Hypnotist, & Life Coach', title: 'Toni *Pitruzzello*',
    body: 'Meet Toni, the rebel with a mission. Breaking down barriers with her no-nonsense attitude and a touch of magic, she’s here to guide you on a journey of self-discovery and empowerment.\n\nAs a Reiki Master Teacher, Clinical Hypnotist, and Certified Life Coach, Toni is a powerhouse of transformation, revolutionizing conventional wisdom with her groundbreaking method - HYPNOREIKI. She’s dedicated to burning down limiting beliefs and nurturing rebirth, empowering women to live life on their own terms and to dance to their own rhythm.\n\nJoin Toni in the dance of shadows and light. Explore her transformative services below and take the first step towards a more balanced, empowered, and magical life.',
    primaryLabel: 'Explore services', primaryHref: '~/services', secondaryLabel: 'Meet Toni', secondaryHref: '~/about',
    image: i('toni-portrait.jpg'), alt: 'Toni Pitruzzello', caption: 'Toni Pitruzzello', tone: 'soft',
  }),
  b('MidnightJourneys', {
    eyebrow: 'Group Programs', title: 'Re-wire *your mind*',
    lead: 'Four-week programs on Zoom: restful sleep, aligned clients and shadow work. Each comes with a workbook, resources and a bonus recording.',
    actionLabel: 'All group programs', actionHref: '~/group-programs', count: 3,
    cards: HOF_PROGRAMS.map((p) => ({
      image: i(p.image), eyebrow: 'Live on Zoom · 4 weeks', title: p.title, meta: p.open ? 'Thursdays 5:30–7pm · next run soon' : 'Enrollment opening soon',
      body: sentence(p.body[0]), price: money(p.price), note: '', href: `~/group-programs#${p.id}`,
    })),
  }),
  b('MidnightGatherings', {
    eyebrow: 'Events', title: 'Hypnotic Sound *on Frequency*', lead: 'Live group hypnosis held over sound. Join from anywhere.',
    actionLabel: 'All events', actionHref: '~/hypnotic-sound', count: 4, image: i('stairs.jpg'), alt: '', rows: [], empty: 'New dates are on the way. Join the email list and you will hear first.',
  }),
  b('MidnightRecordings', {
    eyebrow: 'Pre recorded hypnosis programs', title: 'Powerful transformation *at your fingertips*', lead: '',
    actionLabel: 'All recordings', actionHref: '~/shop', count: 3, note: 'Audio · yours forever', items: recordingItems(HOF_RECORDINGS.slice(0, 3)),
  }),
  pillars('House of Fates', 'Experience *the magic*'),
  b('MidnightFAQ', { eyebrow: 'Questions', title: 'Before you *begin*', lead: '', items: HOF_FAQS }),
  b('MidnightLetter', {
    title: 'Join our', em: 'email list.', lead: 'One letter a month: new recordings, Hypnotic Sound dates and notes from Toni.',
    placeholder: 'you@email.com', buttonLabel: 'Subscribe', successMessage: 'You are in. The next letter arrives on the 1st.',
  }),
  b('MidnightCTA', { title: 'Ready to embark on your inner odyssey?\n*Book a free consultation.*', buttonLabel: 'Book a free consultation', buttonHref: BOOK }),
])

const services = (): BlockSeed[] => [
  pageHero('Unlock your personal power', 'Reclaim your *magic*', 'Discover the transformative power of Reiki, Hypnosis, and HypnoReiki! Each session is designed to help you release the weight of the past, reclaim your energy, and connect with your inner strength.', 'banner.jpg'),
  b('MidnightJump', { items: [{ label: 'Reiki', href: '#reiki' }, { label: 'Hypnosis', href: '#hypnosis' }, { label: 'HypnoReiki', href: '#hypnoreiki' }, { label: 'Pre recorded library', href: '#library' }] }),
  ...HOF_SESSIONS.map((s, n) =>
    b('MidnightService', {
      anchor: s.id, image: i(s.image), alt: '', tone: 'soft', side: n % 2 ? 'right' : 'left', sigil: s.sigil, numeral: s.numeral, label: s.label, title: s.title, body: s.body, pull: s.pull, note: s.note,
      options: s.options.map((o) => ({ name: o.name, meta: o.meta, text: o.text ?? '', price: money(o.price), buttonLabel: s.note ? 'Book package' : 'Book', href: BOOK })),
      ...(s.id === 'hypnosis' ? customPanel() : {}),
    }),
  ),
  b('MidnightRecordings', {
    anchor: 'library', eyebrow: '', title: 'Pre recorded *hypnosis programs*',
    lead: 'Powerful transformation at your fingertips. These guided hypnosis sessions help you release blocks, shift your mindset, and step into alignment, anytime, anywhere. Simply press play and allow the change to begin.',
    actionLabel: '', actionHref: '', count: 24, note: 'Audio · yours forever', items: recordingItems(),
  }),
  band('Ready to embark on your inner odyssey?\n*Begin with a free consultation.*'),
]

const shop = (): BlockSeed[] => [
  pageHero('Hypnosis library', 'Press play and *allow the change to begin*', 'Whether you’re seeking clarity, confidence, abundance, or deep relaxation, each recording is designed to rewire your subconscious and support your journey. Download once, return anytime you need a reset.', 'eye-mask.jpg', 420),
  b('MidnightRecordings', { anchor: '', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '', count: 24, note: 'Audio · yours forever', items: recordingItems() }),
  recordingPanel(),
]

const programs = (): BlockSeed[] => [
  pageHero('Re-wire your mind', 'Choose your *program*', 'Unlock the magic of Hypnosis with programs crafted just for you! These guided journeys are tailored to meet your specific needs. Restful sleep, inner healing, and shadow work. Release blocks, restore balance, and embrace your fullest potential.', 'path.jpg'),
  b('MidnightJump', { items: HOF_PROGRAMS.map((p) => ({ label: p.title, href: `#${p.id}` })) }),
  ...HOF_PROGRAMS.map((p) =>
    b('MidnightProgram', {
      anchor: p.id, tagA: p.tag[0], tagB: p.tag[1], title: p.title, badges: '4-week program\nLive on Zoom', flag: p.open ? '' : 'Enrollment opening soon', body: p.body.join('\n\n'),
      image: i(p.image), alt: '', tone: 'soft', includes: p.includes.map((x) => ({ sigil: x.glyph, title: x.title, body: x.body })),
      addonLabel: p.addon ? 'Add-on opportunity' : '',
      addonBody: p.addon ? 'Enhance your transformation with a personalized 1:1 HypnoReiki session for just $100 ($225 value). Tailored to your specific goals, this session dives even deeper into subconscious reprogramming to maximize your results.' : '',
      primaryLabel: p.open ? `Enroll now ${money(p.price)}` : `Join the waitlist · ${money(p.price)}`, primaryHref: '~/contact-us',
      secondaryLabel: p.open && p.addon ? `Enroll + 1 on 1 ${money(p.addon)}` : '', secondaryHref: '~/contact-us', note: 'Email us about payment plans.',
    }),
  ),
  b('MidnightStatement', {
    label: 'Step towards your truest expression',
    body: 'Imagine breaking free from unconscious conditioning, knowing yourself deeply, and living a life aligned with your true purpose. Experience more fulfillment, meaning, and self-love as you break old patterns and discover your hidden gifts. Your journey to a more authentic, empowered life begins here.',
  }),
  band('Ready to spark your revolution?\n*Work with Toni.*', 'Book a free consultation'),
]

const events = (): BlockSeed[] => [
  pageHero('Events · on Frequency', 'Hypnotic *Sound*', 'Group hypnosis held over live sound, hosted by Toni. Join from anywhere on Frequency, or in the room for selected dates.', 'stairs.jpg', 420),
  b('MidnightEventRows', { count: 12, buttonLabel: 'Reserve', zone: HOUSE_OF_FATES.zone, empty: 'New dates are on the way. Join the email list and you will hear first.', rows: [] }),
  band('Prefer one to one?\n*Book a free consultation.*'),
]

const newsletter = (): BlockSeed[] => [
  pageHero('The House of Fates letter', 'One letter, *each month*', 'New recordings, Hypnotic Sound dates, program openings and notes from Toni. Read past letters below.', 'hero-dunes.jpg', 400),
  b('MidnightSignup', { title: 'Join our *email list*', buttonLabel: 'Join our email list', successMessage: 'You are in. The next letter arrives on the 1st.' }),
]

const about = (): BlockSeed[] => [
  pageHero('Reiki Master Teacher · Clinical Hypnotist · Life Coach', 'Meet *Toni*', '', 'toni-field.jpg', 420),
  b('MidnightHost', {
    eyebrow: '', title: '',
    body: 'Toni is not your average healer, she’s a spell-caster of transformation. As a Reiki Master Teacher, Clinical Hypnotist, Certified Life Coach, and proud Witch, she’s here to revolutionize the way you think, heal, and thrive. With her signature HYPNOREIKI method, she weaves together the mystical and the practical, burning down limiting beliefs and sparking the fire of your rebirth.\n\nToni’s mission? To help people reclaim their power, reconnect with the earth’s ancient rhythms, and dance wildly to their own heartbeat. Step into the dance of shadows and light, and embrace your most magical, empowered self.\n\nReady to spark your revolution? Explore Toni’s transformative services below and start your journey toward a life brimming with balance, power, and magic.',
    primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: i('toni-prayer.jpg'), alt: 'Toni Pitruzzello', caption: 'Toni Pitruzzello', tone: 'soft',
  }),
  pillars('House of Fates', 'Experience *the magic*'),
  band('Ready to spark your revolution?\n*Work with Toni.*', 'Book a free consultation'),
]

const contact = (): BlockSeed[] => [
  b('MidnightContact', {
    image: i('threads.jpg'), alt: '', tone: 'mono', title: 'Contact',
    lead: 'Ready to break free of limiting beliefs and embark on the odyssey of empowered self-actualization? The HOUSE OF FATES team is ready to collaborate with YOU!',
    body: 'Tell us a bit about who you are and what your wildest dreams look like. Share some depth about what life’s been like for you thus far. One of our Coven will be in touch within 1-3 business days.',
    buttonLabel: 'Enter the House of Fates', successTitle: 'Received.', successBody: 'One of our Coven will be in touch within 1-3 business days.',
  }),
]

/** The practice's whole site: the design's pages, in order. */
export function houseOfFatesSitePages(): HofPageSeed[] {
  return [
    { slug: 'home', title: 'Home', nav: false, seo: { title: 'House of Fates | Hypnosis, Reiki, Sound Healing', description: 'HypnoReiki with Toni Pitruzzello: Hypnosis, Reiki and Sound Healing, one to one, in person or virtual, with guided recordings and four-week group programs.' }, blocks: home() },
    { slug: 'services', title: 'Services', nav: true, seo: { title: 'Services', description: 'Reiki, Hypnosis and HypnoReiki sessions with Toni Pitruzzello, in person or virtual.' }, blocks: services() },
    { slug: 'hypnotic-sound', title: 'Events', nav: true, seo: { title: 'Hypnotic Sound', description: 'Group hypnosis held over live sound, hosted by Toni. Join from anywhere on Frequency.' }, blocks: events() },
    { slug: 'group-programs', title: 'Group Programs', nav: true, seo: { title: 'Group Programs', description: 'Four-week programs on Zoom: restful sleep, aligned clients and shadow work.' }, blocks: programs() },
    { slug: 'shop', title: 'Hypnosis Library', nav: true, seo: { title: 'Hypnosis Library', description: 'Guided hypnosis recordings to download and keep, plus a custom recording made for you.' }, blocks: shop() },
    { slug: 'newsletter', title: 'Newsletter', nav: true, seo: { title: 'Newsletter', description: 'One letter each month from Toni: new recordings, event dates and program openings.' }, blocks: newsletter() },
    { slug: 'about', title: 'About', nav: false, seo: { title: 'About Toni', description: 'Toni Pitruzzello is a Reiki Master Teacher, Clinical Hypnotist and Life Coach in Carlsbad.' }, blocks: about() },
    { slug: 'contact-us', title: 'Contact', nav: false, seo: { title: 'Contact', description: 'Write to the House of Fates. One of our Coven will be in touch within 1-3 business days.' }, blocks: contact() },
  ]
}

const path = (slug: string) => `/spaces/${HOF_SLUG}/${slug}`

/** The footer the design sets: three link columns, the letter sign-up, and the foot line. */
export const HOF_FOOTER = {
  blurb: HOUSE_OF_FATES.line,
  copyright: '© 2026 House of Fates · Privacy · Terms · Accessibility',
  line: 'Runs on Frequency',
  columns: [
    { title: 'Work with us', links: [{ label: 'Book a session', href: path(HOF_BOOKING_LIVE ? 'book' : 'contact-us') }, { label: 'Services', href: path('services') }, { label: 'Hypnosis Library', href: path('shop') }] },
    { title: 'Learn', links: [{ label: 'Events', href: path('hypnotic-sound') }, { label: 'Group Programs', href: path('group-programs') }, { label: 'Newsletter', href: path('newsletter') }] },
    { title: 'The house', lines: [HOUSE_OF_FATES.city], links: [{ label: 'About', href: path('about') }, { label: 'Write to us', href: path('contact-us') }] },
  ],
  subscribe: { title: 'Join our *email list.*', body: '', fine: '', button: 'Subscribe', placeholder: 'you@email.com', success: 'You are in. The next letter arrives on the 1st.' },
  utility: {
    left: 'Hypnotic Sound · on Frequency',
    items: [{ label: 'Hypnosis Library', href: path('shop') }, { label: 'Newsletter', href: path('newsletter') }, { label: 'About', href: path('about') }, { label: 'Contact', href: path('contact-us') }],
  },
} as const

/** The saved Space menu: the header's six links in the design's order. About and Contact live in the top bar and the
 *  footer, so `known` lists them to keep them out of the header. */
export const HOF_MENU = {
  v: 1 as const,
  items: [
    { id: 'services', label: 'Services', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:services' } },
    { id: 'book', label: 'Book', visibility: 'website' as const, target: { kind: 'auto' as const, key: HOF_BOOKING_LIVE ? 'feature:book' : 'page:contact-us' } },
    { id: 'events', label: 'Events', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:hypnotic-sound' } },
    { id: 'programs', label: 'Group Programs', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:group-programs' } },
    { id: 'library', label: 'Hypnosis Library', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:shop' } },
    { id: 'newsletter', label: 'Newsletter', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:newsletter' } },
  ],
  known: ['home', 'services', 'hypnotic-sound', 'group-programs', 'shop', 'newsletter', 'about', 'contact-us'].map((k) => `page:${k}`),
}

/** The kit's accent, resolved to hex (the Hypnotist kit's violet and blood blend). The Space stores it as its brand accent. */
const HOF_ACCENT = '#B377AF' // token-ok: the stored brand accent is data, the Hypnotist kit's own mauve

/** The published website state the editor stores: every page's blocks with stable ids, no comments, one version. */
export function houseOfFatesEditorState(now: string, revision = 1): WebsiteEditorState {
  const pages = houseOfFatesSitePages().map((p) => ({
    slug: p.slug,
    label: p.title,
    seo: { ...p.seo },
    comments: [],
    doc: { root: {}, content: p.blocks.map((blk, n) => ({ type: blk.type, props: { ...structuredClone(blk.props), id: `hf-${p.slug}-${n + 1}` } })) },
  }))
  const snapshot: WebsiteSnapshot = {
    theme: 'Midnight',
    brand: { accent: HOF_ACCENT },
    chrome: { name: HOUSE_OF_FATES.name, tagline: HOUSE_OF_FATES.tagline, cta: { label: 'Book a free consultation', href: HOF_BOOKING_LIVE ? '/book' : '/contact-us' } },
    pages,
  }
  return { v: 1, revision, draft: snapshot, published: structuredClone(snapshot), versions: [{ id: String(revision), createdAt: now, author: 'Frequency', snapshot: structuredClone(snapshot) }] }
}
