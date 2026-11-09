import { SERVICES_ACCENTS } from '@/lib/theme/services'
import type { KitPage, SiteKit } from './types'
import { SERVICES_TRADES, servicesKitDescription, type ServicesTradeId, type ServicesTradeSpec } from './services-trades-data'

// Services' sixteen trade kits (design system "Services", frequency/kits.services.json), `services-<trade>`: General plus fifteen trades,
// each one sample business written in its trade's own words. They are the starting point of a Services site and nothing else: the seven
// niche kits of the design system's revision 2 belong to New World (new-world-variants.ts, LIVE-2056).
//
// The pages are built from the Services block family (components/page-editor/blocks/services.tsx). Every kit lays out the design's four
// pages: Home, Services, About and Book. HOUSE VOICE (docs/marketing/voice-and-language-guide.md): the design's own words, except where they
// make a claim. Prices ride `{{offerNPrice|...}}` slot tokens (lib/spaces/content-slots.ts) so a Space that has filled in its own offers shows
// those; a trust line that carried a number or a score becomes a prompt; reviews are prompts to ask a real client, never a quote with a
// made-up name. The sixteen kits share the General niche id (they are all service businesses); the trade is the kit's own id.

/** The Frequency tools a kit turns on (design kits.js tools). Lane A reads them to build a Spotlight's doors. */
type ServicesTool = ServicesTradeSpec['tools'][number]
/** A kit of the Services theme. Same shape as SiteKit, plus the trade it is and the tools it runs. */
type ServicesKit = Omit<SiteKit, 'theme' | 'niche'> & { theme: 'Services'; niche: 'general'; trade: ServicesTradeId; tools: readonly ServicesTool[] }

type Block = KitPage['blocks'][number]
const slot = (key: string, sample: string) => `{{${key}|${sample}}}`
const hasNumber = (s: string) => /\d/.test(s)

/** The General kit's photo hero: a window washer at work (owner's picture, 2026-11-05), the Services theme's hero everywhere it shows. */
const SERVICES_HERO_IMAGE = '/sites/services/hero-squeegee.webp'
const SERVICES_HERO_ALT = 'A window washer with a squeegee on a long blue pole, cleaning a tall storefront window'

function pages(s: ServicesTradeSpec, trade: ServicesTradeId): KitPage[] {
  const offers = s.offers.map((o, i) => ({
    name: slot(`offer${i + 1}Title`, o.name), meta: o.length, body: slot(`offer${i + 1}Blurb`, o.meta), price: slot(`offer${i + 1}Price`, o.price), href: '~/booking',
  }))
  const hero: Block = {
    type: 'ServicesHero',
    props: {
      look: 'photo', eyebrow: s.hero.eyebrow, title: `${s.hero.title} *${s.hero.em}*`, lead: s.hero.body,
      primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: 'See what we do', secondaryHref: '~/services', proof: '', image: trade === 'general' ? SERVICES_HERO_IMAGE : '', alt: trade === 'general' ? SERVICES_HERO_ALT : '',
      panelTitle: 'Book online', panelNote: 'Pick a time', offers: offers.map((o) => ({ name: o.name, meta: o.meta, price: o.price, href: o.href })), areas: [],
    },
  }
  // A trust line with a number in it (a score, a count, a time) is a claim only the owner can make: it becomes a prompt for that kind of line.
  const prompt = (t: string) =>
    /review|rating|star/i.test(t) ? 'Your review score, once you have one' : /guarantee|warrant/i.test(t) ? 'What you guarantee, in plain words' : /hour|day|week|same|minute/i.test(t) ? 'How soon you can be there' : 'Say what you stand behind'
  const trustLines = s.trust.map((t) => (hasNumber(t) ? prompt(t) : t))
  const trust: Block = { type: 'ServicesTrust', props: { items: trustLines.map((title) => ({ title, line: '' })) } }
  const list: Block = {
    type: 'ServicesList',
    props: { eyebrow: 'Services', title: 'What we *do.*', lede: 'Every service shows a price and a length.', buttonLabel: 'See open times', buttonHref: '~/booking', rows: offers.map((o) => ({ meta: o.meta, name: o.name, body: o.body, price: o.price, href: o.href })) },
  }
  const reviews: Block = {
    type: 'ServicesReviews',
    props: {
      eyebrow: 'Reviews', title: 'In their *words.*', lede: '', proof: '',
      rows: s.reviewsAbout.map((what, i) => ({ quote: 'Replace with a real quote from a real client. Specific beats glowing.', who: `Client ${['one', 'two', 'three'][i] ?? i + 1}`, what })),
    },
  }
  const events: Block | null = s.events.length
    ? {
        type: 'ServicesEvents',
        props: { eyebrow: 'Events', title: "What's *on.*", lede: '', buttonLabel: '', buttonHref: '', rows: s.events.map(([title, body], i) => ({ meta: '', title: slot(`event${i + 1}Title`, title), body, price: '', href: '~/booking', featured: i === 0 })) },
      }
    : null
  const plans: Block | null = s.plans.length
    ? { type: 'ServicesPlans', props: { eyebrow: 'Plans', title: 'Keep *coming back.*', lede: '', rows: s.plans.map(([title, body], i) => ({ meta: '', title, body, price: 'Set your price', href: '~/booking', featured: i === 1 })) } }
    : null
  const shop: Block | null = s.products.length
    ? { type: 'ServicesShop', props: { eyebrow: 'Shop', title: 'Take some *home.*', lede: '', buttonLabel: 'Open the shop', buttonHref: '~/services', rows: s.products.map(([title, body]) => ({ meta: '', title, body, price: 'Set your price', href: '', image: '', alt: '' })) } }
    : null
  const faq: Block = {
    type: 'ServicesFaq',
    props: {
      eyebrow: 'Questions', title: 'Good to *know.*', lede: 'Anything else, ask. A real person answers.',
      rows: [
        { question: 'How do I book?', answer: 'Pick a time online. You get a confirmation and a reminder. Say here if people can also call.' },
        { question: 'What does it cost?', answer: 'Every service shows its price and how long it takes. Say what can change the price and when you tell people.' },
        { question: 'What if I need to change the time?', answer: 'Change or cancel from the confirmation email. Say how late is too late.' },
      ],
      facts: [], areas: [],
    },
  }
  const band: Block = { type: 'ServicesBand', props: { eyebrow: 'Next opening', title: `${s.hero.title} *${s.hero.em}*`, primaryLabel: s.cta, primaryHref: '~/booking', secondaryLabel: '', secondaryHref: '' } }
  const story: Block = {
    type: 'ServicesStory',
    props: { eyebrow: 'Our story', title: 'Who is *behind it.*', paragraphs: [s.hero.body, 'Tell people who you are, how long you have done this and why you started. Two honest sentences beat a long page.'], buttonLabel: 'Book a visit', buttonHref: '~/booking', image: '', alt: '' },
  }
  const team: Block = {
    type: 'ServicesTeam',
    props: { eyebrow: 'The team', title: 'The people *behind it.*', lede: '', rows: s.team.map(([name, role], i) => ({ name: slot(`person${i + 1}Name`, name), role, image: '', alt: '' })) },
  }
  const posts: Block = {
    type: 'ServicesPosts',
    props: { eyebrow: 'Notes', title: 'Worth *a read.*', lede: '', buttonLabel: '', buttonHref: '', rows: s.posts.map(([kind, title]) => ({ meta: kind, title, body: '', price: '', href: '', image: '', alt: '' })) },
  }
  const locations: Block = {
    type: 'ServicesLocations',
    props: { eyebrow: 'Where we work', title: 'Where to *find us.*', lede: '', address: slot('address', 'Your street, Your City'), phone: slot('phone', 'Your phone'), email: slot('email', 'Your email'), hours: [], areas: [], image: '', alt: '' },
  }
  const letter: Block = {
    type: 'ServicesLetter',
    props: { eyebrow: 'Newsletter', title: 'Stay in *the loop.*', lede: 'A short note now and then. Nothing else.', buttonLabel: 'Join the list', buttonHref: '~/booking' },
  }
  const booking: Block = {
    type: 'ServicesBooking',
    props: {
      eyebrow: 'Book online', title: 'Next *openings.*', lede: 'Live availability. Pick a time, see the total, get a confirmation.', buttonLabel: s.cta, buttonHref: '~/booking',
      rows: offers.map((o) => ({ day: o.meta, title: o.name, meta: o.body, time: '', href: '~/booking' })),
    },
  }
  const contact: Block = {
    type: 'ServicesContact',
    props: { eyebrow: 'Get in touch', title: 'Ask us *anything.*', lede: 'A person answers. Usually the same day.', body: '', buttonLabel: 'Send a message', buttonHref: '~/booking', secondaryLabel: '', secondaryHref: '' },
  }
  const compact = (xs: (Block | null)[]) => xs.filter((b): b is Block => b !== null)
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo(s.name, s.descriptor), blocks: compact([hero, trust, list, reviews, events, band]) },
    { slug: 'services', label: 'Services', seo: seo('Services', `${s.name}: what we do and what it costs.`), blocks: compact([list, plans, shop, faq, band]) },
    { slug: 'about', label: 'About', seo: seo('About', `Who is behind ${s.name}.`), blocks: compact([story, team, posts, locations, letter]) },
    { slug: 'booking', label: 'Book', seo: seo('Book', `Pick a time at ${s.name}.`), blocks: compact([booking, contact]) },
  ]
}

export function servicesKit(trade: ServicesTradeId): ServicesKit {
  const s: ServicesTradeSpec = SERVICES_TRADES[trade]
  return {
    id: `services-${trade}`, version: 1, theme: 'Services', niche: 'general', trade, label: s.label, description: servicesKitDescription(trade),
    tools: s.tools, accent: SERVICES_ACCENTS[s.accent].accent, pages: pages(s, trade),
  }
}
