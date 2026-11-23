import { AIDEN_TYACK_ACCENTS } from '@/lib/theme/aiden-tyack'
import type { KitPage, SiteKit } from './types'

// The Aiden Tyack starter kit (`aiden-tyack-general`). PRIVATE like its theme: it is in no kit library index, so only a Space that wears
// the theme (aidentyack.com, PRIVATE_THEME_SITES) is ever given it, by id. Words from the handoff's starter-copy.json: coaching copy that
// says what to write, never a made-up number, review or promise (the stats ship as "00"). Headings are Title Case, as the theme's
// blackletter is never set in caps.
//
// BLOCKS (LIVE-2514). Every page is built from the shared role blocks (lib/blocks/roles), the same sections the handoff's
// theme.manifest.json lists, so the owner can switch any section to its other version in the editor. A block with no layout picked draws
// the theme's default (components/sites/presentation/aiden-tyack.ts); the kit names every layout so each page draws as the handoff does.
// The skin (components/sites/aiden-tyack-css.ts) dresses them: grain, the stitch, blackletter. Photos are the handoff's stand-ins
// (public/sites/aiden-tyack/photos), each named for what it shows, for the owner to swap for his own.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): no em dashes, no exclamation marks, no emoji; prices are left for the owner.

type Block = KitPage['blocks'][number]

const PHOTO = (name: string) => `/sites/aiden-tyack/photos/${name}.webp`

const role = (type: string, props: Record<string, unknown>): Block => ({ type, props: { variant: '', tone: '', ...props } })
const rows = <T extends readonly unknown[]>(list: readonly T[], map: (row: T) => Record<string, unknown>) => list.map(map)

const PRODUCTS = [
  ['belt-tan-coiled-studs', 'A coiled tan leather belt with a brass buckle'],
  ['cuff-tan-brass-stud', 'A tan leather cuff with a brass stud'],
  // KEEP -black: a photo's file name (the cuff is black leather), not a colour utility.
  ['cuff-black-leather-harbor', 'A black leather cuff held up by a harbour'],
  ['bracelet-double-wrap-tan', 'A tan leather bracelet wrapped twice'],
] as const

/** The band gallery under the steps (the handoff's three photos, edge to edge). */
const BAND = [
  ['motorcycles-at-sunset', 'Motorcycles parked at sunset'],
  ['belt-tan-brass-buckle', 'A tan leather belt with a brass buckle'],
  ['friends-at-sunset', 'Friends with their motorcycles at sunset'],
] as const

/** The workshop grid on About (the handoff's gallery grid, six square photos). */
const WORKSHOP = [
  ['belt-tan-coiled-studs', 'A coiled tan belt'],
  ['cuff-tan-brass-stud', 'A tan cuff with a brass stud'],
  ['riders-on-coast-road', 'Riders on a coast road'],
  ['bracelet-double-wrap-tan', 'A tan bracelet wrapped twice'],
  // KEEP -black: a photo's file name (the cuff is black leather), not a colour utility.
  ['cuff-black-leather-harbor', 'A black leather cuff'],
  ['motorcycles-at-sunset', 'Motorcycles parked at sunset'],
] as const

// THE PAGES (LIVE-2517). Home is the handoff's own arrangement (ui_kits/site/page.html HOME): forest hero, shop grid, quote, numbered
// steps, band gallery, quotes, stitched questions, call band, letter and contact, each in the theme's version the handoff draws. The
// other pages are built from the same sections, as rules.md asks. The words are the handoff's (starter-copy.json); a button's label
// names where it goes. Headings carry no starred phrase: the handoff sets every heading in one ink.
function pages(): KitPage[] {
  const hero = role('RoleHero', {
    variant: 'split', tone: 'band', eyebrow: 'What you make, in three words', title: 'Say What You Make in One Line',
    lead: 'Who is it for, and what problem does it solve for them? Keep it to two sentences.',
    image: PHOTO('belt-tan-coiled-studs'), alt: 'A coiled tan leather belt with a brass buckle',
    primaryLabel: 'Shop the work', primaryHref: '~/shop', secondaryLabel: 'Ask for a custom piece', secondaryHref: '~/visit',
  })
  const shop = (eyebrow: string, title: string, action: boolean) => role('RoleShop', {
    eyebrow, title, lead: '', actionLabel: action ? 'View all' : '', actionHref: action ? '~/shop' : '',
    items: rows(PRODUCTS, ([photo, alt]) => ({ name: 'Product name', badge: 'Material · detail', price: '$00', image: PHOTO(photo), alt, href: '' })),
  })
  const quote = role('RoleStatement', {
    variant: 'pull', eyebrow: 'Your name, your role', title: 'Write the one sentence you want people to remember about how you work.', lead: '',
    primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', items: [],
  })
  const stamp = role('RoleStatement', {
    variant: 'band', tone: 'band', eyebrow: '', title: 'Built to Outlast You', lead: '',
    primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', items: [],
  })
  const steps = role('RoleSteps', {
    variant: 'grid', eyebrow: 'How it works', title: 'Explain Your Process', lead: '',
    items: rows([['Step one', 'What happens first, and what the customer does.'], ['Step two', 'What you do next, in plain words.'], ['Step three', 'What they receive, and when.']] as const, ([title, body]) => ({ title, body })),
  })
  const band = role('RoleGallery', {
    variant: 'carousel', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '',
    items: rows(BAND, ([photo, alt]) => ({ image: PHOTO(photo), alt, caption: '' })),
  })
  const workshop = role('RoleGallery', {
    variant: 'grid', eyebrow: 'From the workshop', title: 'Show the Work', lead: '', actionLabel: '', actionHref: '',
    items: rows(WORKSHOP, ([photo, alt]) => ({ image: PHOTO(photo), alt, caption: '' })),
  })
  // `stats: []` so the block's default sample figures never ship: the owner adds real ones, or none.
  const proof = role('RoleProof', {
    variant: 'wall', eyebrow: 'Kind words', title: 'Let Customers Speak', lead: '', stats: [],
    items: rows([["Paste a real review here, in the customer's own words.", 'Customer name'], ['Short and specific beats long and general.', 'Customer name'], ['Ask permission before you use a name.', 'Customer name']] as const, ([quote, name]) => ({ quote, name, role: '', photo: '', rating: 0 })),
  })
  const faq = role('RoleFaq', {
    variant: 'split', eyebrow: 'Questions', title: 'Answer the Doubts', lead: '',
    items: rows([['What do people ask before they buy?', 'Answer in two sentences. Be direct.'], ['What worries them about sizing or delivery?', 'Say exactly what happens.'], ['What happens if something goes wrong?', 'Say how you fix it.']] as const, ([question, answer]) => ({ question, answer })),
  })
  const cta = role('RoleCta', {
    variant: 'band', eyebrow: 'Ready?', title: 'Ask for the Next Step', lead: 'One line on why now is a good time.',
    primaryLabel: 'Get in touch', primaryHref: '~/visit', secondaryLabel: '', secondaryHref: '',
  })
  // The letter takes the email right here (the form switch), the handoff's inline card.
  const letter = role('RoleLetter', {
    variant: 'card', eyebrow: '', title: 'Offer Something Worth an Email', lead: 'Say what people get and how often. No spam promises needed.',
    form: true, field: 'Email address', primaryLabel: 'Sign up', primaryHref: '', note: '',
  })
  const contact = role('RoleContact', {
    variant: 'split', eyebrow: 'Contact', title: 'Make It Easy to Reach You', lead: 'Say how fast you reply and what to include.',
    items: [
      { label: 'Email', value: '{{email|you@yourdomain.com}}', href: '' },
      { label: 'Where', value: '{{address|Your city, or by appointment}}', href: '' },
      { label: 'Replies', value: 'Your usual reply time', href: '' },
    ],
    form: true, primaryLabel: 'Send', primaryHref: '', secondaryLabel: '', secondaryHref: '', note: '',
  })
  const maker = role('RolePeople', {
    variant: 'founder', tone: 'surface', eyebrow: 'Who you will meet', title: 'Introduce the Maker',
    lead: 'Tell people who makes the work and why they care about it. Two or three sentences.',
    items: [{ name: '{{person1Name|Your name}}', role: 'Maker', bio: '', photo: PHOTO('rider-portrait'), href: '' }],
  })
  // `live: false`: a new Space's own counts ("1 member") are no figure to lead with, so the band shows the owner's own numbers only.
  const stats = role('RoleStats', {
    eyebrow: 'In numbers', title: '', lead: '', live: false, variant: 'row',
    items: rows([['00', 'A number you can stand behind'], ['00', 'Another fact a customer can check'], ['00', 'Keep it honest and specific']] as const, ([value, label]) => ({ value, label, note: '' })),
  })
  // The handoff's offerings cards, for custom work beside the shop. `live: false` keeps them the owner's words, not the Space's practices.
  const offerings = role('RoleOfferings', {
    variant: 'cards', eyebrow: 'What we offer', title: 'Name What You Sell', lead: '', actionLabel: '', actionHref: '', live: false,
    items: [0, 1, 2].map(() => ({ title: 'Offering name', body: 'One line on who it suits and why.', price: 'From $00', href: '~/visit', image: '' })),
  })
  const journal = role('RoleLibrary', {
    variant: 'grid', eyebrow: 'Journal', title: 'Share What You Know', lead: '', actionLabel: '', actionHref: '',
    items: [['belt-tan-brass-buckle', 'A tan belt'], ['cuff-tan-brass-stud', 'A tan cuff'], ['riders-on-coast-road', 'Riders on a coast road']].map(([photo]) => ({ title: 'Post title', kind: 'Journal', meta: 'One line on what the reader will learn.', image: PHOTO(photo), href: '' })),
  })
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo('Aiden Tyack', 'What you make, in a few words'), blocks: [hero, shop('The shop', 'Name Your Collection', true), quote, steps, band, proof, faq, cta, letter, contact] },
    { slug: 'shop', label: 'Shop', seo: seo('Shop', 'The collection, with prices in plain sight.'), blocks: [shop('The shop', 'Name Your Collection', false), offerings, faq, letter] },
    { slug: 'about', label: 'About', seo: seo('About', 'Who makes the work, and how.'), blocks: [maker, stats, stamp, workshop, journal, cta] },
    { slug: 'visit', label: 'Contact', seo: seo('Contact', 'How to reach the workshop.'), blocks: [contact, faq] },
  ]
}

export function aidenTyackKit(): SiteKit {
  return {
    id: 'aiden-tyack-general', version: 3, theme: 'AidenTyack', niche: 'general', label: 'Aiden Tyack',
    description: 'The workshop: what you make, how it is made, the shop and an easy way to reach you, with words that coach you what to write.',
    accent: AIDEN_TYACK_ACCENTS.walnut.day.accent,
    pages: pages(),
  }
}
