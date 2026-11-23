import { AIDEN_TYACK_ACCENTS } from '@/lib/theme/aiden-tyack'
import type { KitPage, SiteKit } from './types'

// The Aiden Tyack starter kit (`aiden-tyack-general`). PRIVATE like its theme: it is in no kit library index, so only a Space that wears
// the theme (aidentyack.com, PRIVATE_THEME_SITES) is ever given it, by id. Words from the handoff's starter-copy.json: coaching copy that
// says what to write, never a made-up number, review or promise (the stats ship as "00"). Headings are Title Case, as the theme's
// blackletter is never set in caps.
//
// BLOCKS (LIVE-2514). Every page is built from the shared role blocks (lib/blocks/roles), the same sections the handoff's
// theme.manifest.json lists, so the owner can switch any section to its other version in the editor. A block with no layout picked draws
// the theme's default (components/sites/presentation/aiden-tyack.ts); the kit names a layout only where the page wants the other version.
// The skin (components/sites/aiden-tyack-css.ts) dresses them: grain, the stitch, blackletter. Photos are the handoff's stand-ins
// (public/sites/aiden-tyack/photos), each named for what it shows, for the owner to swap for his own.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): no em dashes, no exclamation marks, no emoji; prices are left for the owner.

type Block = KitPage['blocks'][number]

const PHOTO = (name: string) => `/sites/aiden-tyack/photos/${name}.webp`
/** The redwood silhouette sits only behind the forest hero (rules.md), where the skin keeps it at 40%. Decorative, so no alt. */
const SILHOUETTE = '/sites/aiden-tyack/redwood-forest-silhouette.webp'

const role = (type: string, props: Record<string, unknown>): Block => ({ type, props: { variant: '', tone: '', ...props } })
const rows = <T extends readonly unknown[]>(list: readonly T[], map: (row: T) => Record<string, unknown>) => list.map(map)

const PRODUCTS = [
  ['belt-tan-brass-buckle', 'A tan leather belt with a brass buckle'],
  ['cuff-tan-brass-stud', 'A tan leather cuff with a brass stud'],
  ['bracelet-double-wrap-tan', 'A tan leather bracelet wrapped twice'],
  // KEEP -black: a photo's file name (the cuff is black leather), not a colour utility.
  ['cuff-black-leather-harbor', 'A black leather cuff'],
] as const

const GALLERY = [
  ['riders-on-coast-road', 'Riders on a coast road'],
  ['belt-tan-coiled-studs', 'A coiled tan belt with studs'],
  ['motorcycles-at-sunset', 'Motorcycles parked at sunset'],
  ['friends-at-sunset', 'Friends together at sunset'],
  ['rider-on-beach', 'A rider on the beach'],
] as const

function pages(): KitPage[] {
  const hero = role('RoleHero', {
    tone: 'band', eyebrow: 'What you make, in three words', title: 'Say What You Make *in One Line*',
    lead: 'Who is it for, and what problem does it solve for them? Keep it to two sentences.',
    image: SILHOUETTE, alt: '', primaryLabel: 'Shop the work', primaryHref: '~/shop', secondaryLabel: 'Ask for a custom piece', secondaryHref: '~/visit',
  })
  const photoHero = role('RoleHero', {
    variant: 'split', eyebrow: 'The workshop', title: 'Made by Hand, *Built to Last*',
    lead: 'Say who makes the work and what goes into each piece. Two sentences is plenty.',
    image: PHOTO('rider-portrait'), alt: 'A rider in a leather jacket', primaryLabel: 'Ask a question', primaryHref: '~/visit', secondaryLabel: '', secondaryHref: '',
  })
  const stats = role('RoleStats', {
    eyebrow: 'In numbers', title: '', lead: '',
    items: rows([['00', 'A number you can stand behind'], ['00', 'Another fact a customer can check'], ['00', 'Keep it honest and specific']] as const, ([value, label]) => ({ value, label, note: '' })),
  })
  const offerings = role('RoleOfferings', {
    eyebrow: 'What we offer', title: 'Name *What You Sell*', lead: '', actionLabel: '', actionHref: '',
    items: [0, 1, 2].map((i) => ({ title: `{{offer${i + 1}Title|Offering name}}`, body: `{{offer${i + 1}Blurb|One line on who it suits and why.}}`, price: `{{offer${i + 1}Price|From $00}}`, href: '~/visit', image: '' })),
  })
  const steps = role('RoleSteps', {
    eyebrow: 'How it works', title: 'Explain *Your Process*', lead: '',
    items: rows([['Step one', 'What happens first, and what the customer does.'], ['Step two', 'What you do next, in plain words.'], ['Step three', 'What they receive, and when.']] as const, ([title, body]) => ({ title, body })),
  })
  const shop = role('RoleShop', {
    eyebrow: 'The shop', title: 'Name Your *Collection*', lead: '', actionLabel: 'View all', actionHref: '~/shop',
    items: rows(PRODUCTS, ([photo, alt]) => ({ name: 'Product name', price: 'Set your price', image: PHOTO(photo), alt, badge: '', href: '' })),
  })
  const statement = role('RoleStatement', {
    eyebrow: 'Your name, your role', title: 'Write the one sentence you want people to remember about *how you work*.', lead: '',
    primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', items: [],
  })
  const stamp = role('RoleStatement', {
    variant: 'band', tone: 'band', eyebrow: '', title: 'Built to *Outlast You*', lead: '',
    primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', items: [],
  })
  // `stats: []` so the block's default sample figures never ship: the owner adds real ones, or none.
  const proof = role('RoleProof', {
    eyebrow: 'Kind words', title: 'Let *Customers Speak*', lead: '', stats: [],
    items: rows([["Paste a real review here, in the customer's own words.", 'Customer name'], ['Short and specific beats long and general.', 'Customer name'], ['Ask permission before you use a name.', 'Customer name']] as const, ([quote, name]) => ({ quote, name, role: '', photo: '', rating: 0 })),
  })
  const gallery = role('RoleGallery', {
    eyebrow: 'From the workshop', title: 'Show *the Work*', lead: '', actionLabel: '', actionHref: '',
    items: rows(GALLERY, ([photo, alt]) => ({ image: PHOTO(photo), alt, caption: '' })),
  })
  const galleryGrid = { ...gallery, props: { ...gallery.props, variant: 'grid' } }
  const letter = role('RoleLetter', {
    tone: 'band', eyebrow: 'Letters', title: 'Offer Something *Worth an Email*', lead: 'Say what people get and how often. No spam promises needed.',
    primaryLabel: 'Sign up', primaryHref: '~/join', note: '',
  })
  const letterInline = { ...letter, props: { ...letter.props, variant: 'inline', tone: '' } }
  const cta = role('RoleCta', {
    tone: 'band', eyebrow: 'Ready?', title: 'Ask for *the Next Step*', lead: 'One line on why now is a good time.',
    primaryLabel: 'Main action', primaryHref: '~/visit', secondaryLabel: '', secondaryHref: '',
  })
  const faq = role('RoleFaq', {
    eyebrow: 'Questions', title: 'Answer *the Doubts*', lead: '', live: false,
    items: rows([['What do people ask before they buy?', 'Answer in two sentences. Be direct.'], ['What worries them about sizing or delivery?', 'Say exactly what happens.'], ['What happens if something goes wrong?', 'Say how you fix it.']] as const, ([question, answer]) => ({ question, answer })),
  })
  const people = role('RolePeople', {
    eyebrow: 'Who you will meet', title: 'Introduce *the Maker*', lead: 'Tell people who makes the work and why they care about it. Two or three sentences.',
    items: [
      { name: '{{person1Name|Your name}}', role: 'Maker', bio: 'A line or two about you, in your own words.', photo: PHOTO('rider-portrait'), href: '' },
      { name: '{{person2Name|Name}}', role: 'Role', bio: '', photo: '', href: '' },
      { name: '{{person3Name|Name}}', role: 'Role', bio: '', photo: '', href: '' },
    ],
  })
  const journal = role('RoleLibrary', {
    eyebrow: 'Journal', title: 'Share *What You Know*', lead: '', actionLabel: '', actionHref: '',
    items: [0, 1, 2].map(() => ({ title: 'Post title', kind: 'Journal', meta: 'One line on what the reader will learn.', image: '', href: '' })),
  })
  const contact = role('RoleContact', {
    eyebrow: 'Contact', title: 'Make It Easy *to Reach You*', lead: 'Say how fast you reply and what to include.',
    items: [
      { label: 'Email', value: '{{email|you@yourdomain.com}}', href: '' },
      { label: 'Where', value: '{{address|Your city, or by appointment}}', href: '' },
      { label: 'Replies', value: 'Your usual reply time', href: '' },
    ],
    primaryLabel: 'Send a message', primaryHref: '~/join', secondaryLabel: '', secondaryHref: '',
  })
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo('Your name', 'What you make, in a few words'), blocks: [hero, stats, offerings, steps, shop, statement, proof, gallery, letter, cta] },
    { slug: 'shop', label: 'Shop', seo: seo('Shop', 'The collection, with prices in plain sight.'), blocks: [shop, faq, letterInline] },
    { slug: 'about', label: 'About', seo: seo('About', 'Who makes the work, and how.'), blocks: [photoHero, people, stamp, galleryGrid, journal, cta] },
    { slug: 'visit', label: 'Contact', seo: seo('Contact', 'How to reach the workshop.'), blocks: [contact, faq] },
  ]
}

export function aidenTyackKit(): SiteKit {
  return {
    id: 'aiden-tyack-general', version: 2, theme: 'AidenTyack', niche: 'general', label: 'Aiden Tyack',
    description: 'The workshop: what you make, how it is made, the shop and an easy way to reach you, with words that coach you what to write.',
    accent: AIDEN_TYACK_ACCENTS.walnut.day.accent,
    pages: pages(),
  }
}
