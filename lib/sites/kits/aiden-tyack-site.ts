import { layoutDefault } from '@/lib/page-editor/layout'
import { AIDEN_TYACK_ACCENTS } from '@/lib/theme/aiden-tyack'
import type { KitPage, SiteKit } from './types'

// THE AIDEN TYACK SITE (`aiden-tyack-site`, LIVE-2519): the site Daniel designed in Claude Design for aidentyack.com ("Aiden Tyack
// Website.html", 2026-11-23), page by page, in his words. The starter kit beside it (aiden-tyack-variants.ts) is the handoff's coaching
// template; this is the finished site. PRIVATE like its theme: no index lists it, so only aidentyack.com is ever given it, by id.
//
// Every page is built from the shared role blocks, so the owner edits every word and photo in the editor. The design's parts map to them:
//   · the forest hero: the split hero on the band, the rider portrait with the pinned Brass Stud Cuff print and the turning seal;
//   · the shop: the Shop block with its filters switch (tabs, count, price sort) and each product's material line and edition label;
//   · the photo bands: a one-photo Gallery band (home) or the full hero (The Maker, Custom), so each page keeps one h1;
//   · How it's made: stitched step cards on parchment; the custom work split: the Story block with the photo on the left;
//   · Talk to the Workshop: the Contact block's form with the design's topics, sent through the Space's lead door.
// Photos are the design's own (public/sites/aiden-tyack/photos), named for what they show. The crop of each is the design's.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): no em dashes, no exclamation marks, no emoji. Product names are the design's,
// except its black cuff, which the house word list renames the Harbor Cuff (after its photo).

type Block = KitPage['blocks'][number]

const PHOTO = (name: string) => `/sites/aiden-tyack/photos/${name}.webp`
const role = (type: string, props: Record<string, unknown>): Block => ({ type, props: { variant: '', tone: '', ...props } })
/** A section that sits right under the one before it (the page intros run straight into their content, as the design's do). */
const flush = { ...layoutDefault, spaceTop: 'none' }

/** The design's eight pieces (its AT_PRODUCTS), in its order: name, category, price, material, edition, photo, crop. */
const PRODUCTS = [
  ['Studded Belt', 'Belts', '$140', 'Tan veg-tan · solid brass buckle', 'No. 014', 'belt-tan-coiled-studs', '', 'A coiled tan studded belt with a solid brass buckle'],
  ['Harness Belt', 'Belts', '$125', 'Saddle tan · brass center bar', '', 'belt-tan-brass-buckle', '', 'A saddle tan belt with a brass buckle'],
  ['Brass Stud Cuff', 'Bracelets', '$85', 'Chestnut bridle · brass stud', '', 'cuff-tan-brass-stud', '', 'A chestnut leather cuff with a brass stud'],
  // KEEP -black: a photo's file name (the cuff is black leather), not a colour utility.
  ['Harbor Cuff', 'Bracelets', '$90', 'Black bridle · brass stud', 'New', 'cuff-black-leather-harbor', '', 'A black leather cuff held up over a harbor'],
  ['Double Wrap', 'Bracelets', '$95', 'Tan nappa · brass screw', '', 'bracelet-double-wrap-tan', '', 'A tan leather bracelet wrapped twice'],
  ['Roller Belt', 'Belts', '$150', 'Tan veg-tan · black edge', 'Limited', 'belt-tan-brass-buckle', '30% 60%', 'A tan belt with a roller buckle'],
  ['Rider Cuff', 'Bracelets', '$110', 'Chestnut bridle · double stud', '', 'cuff-tan-brass-stud', '60% 70%', 'A chestnut cuff with two studs'],
  ['Everyday Belt', 'Belts', '$120', 'Tan veg-tan · 1.25 in', '', 'belt-tan-coiled-studs', '70% 40%', 'A coiled tan everyday belt'],
] as const

function pages(): KitPage[] {
  const hero = role('RoleHero', {
    variant: 'split', tone: 'band', eyebrow: 'Batch No. 014 · Now open', title: 'Built to Outlast You',
    lead: 'Studded belts and bracelets, made by hand from vegetable-tanned hide and solid hardware.',
    image: PHOTO('rider-portrait'), alt: 'A rider wearing a chestnut cuff', focus: '50% 35%',
    primaryLabel: 'Shop the Collection', primaryHref: '~/shop', secondaryLabel: 'Order Custom', secondaryHref: '~/custom',
    cardImage: PHOTO('cuff-tan-brass-stud'), cardLabel: 'Brass Stud Cuff', cardPrice: '$85', cardHref: '~/shop',
    seal: 'HANDMADE IN SAN DIEGO · NUMBERED & SIGNED · ',
  })
  const shop = role('RoleShop', {
    variant: 'grid', eyebrow: 'The Shop', title: 'Belts & Bracelets', lead: 'Each one numbered and signed.', actionLabel: '', actionHref: '', filters: true,
    items: PRODUCTS.map(([name, category, price, detail, badge, photo, focus, alt]) => ({ name, category, price, detail, badge, image: PHOTO(photo), focus, alt, href: '' })),
  })
  const band = role('RoleGallery', {
    variant: 'carousel', eyebrow: 'At the bench', title: 'Made for the Long Way Home',
    lead: 'Every strap is cut, dyed, punched and set by hand at one bench in San Diego, one piece at a time.', actionLabel: '', actionHref: '',
    items: [{
      image: PHOTO('at-the-bench-still'), alt: 'Aiden dyeing a studded strap at his workbench', focus: '50% 40%', caption: '',
      video: '/sites/aiden-tyack/video/at-the-bench.mp4', videoWebm: '/sites/aiden-tyack/video/at-the-bench.webm',
    }],
  })
  const made = role('RoleSteps', {
    variant: 'grid', tone: 'surface', eyebrow: "How it's made", title: 'One Pair of Hands', lead: '',
    items: [
      { title: 'Cut', body: 'Each strap is cut from a single 8–9 oz vegetable-tanned shoulder.' },
      { title: 'Punch & Set', body: 'Holes are punched by hand. Every stud is set and peened one at a time.' },
      { title: 'Burnish & Sign', body: 'Edges are slicked with beeswax. Every piece is numbered and signed.' },
    ],
  })
  const custom = role('RoleStory', {
    variant: 'split', flip: true, eyebrow: 'Custom work', title: 'Yours, Down to the Last Stud',
    lead: 'Pick the hide, width, hardware and stud pattern. Every custom piece starts with a conversation at the bench.',
    items: [], quote: '', image: PHOTO('aiden-at-the-bench'), alt: 'Aiden at his workbench, dyeing a blue strap', focus: '40% 45%',
    primaryLabel: 'Start a Custom Order', primaryHref: '~/custom', secondaryLabel: '', secondaryHref: '',
  })
  const talk = role('RoleContact', {
    variant: 'split', tone: 'surface', eyebrow: 'Contact', title: 'Talk to the Workshop',
    lead: 'Sizing, repairs, wholesale or anything else. Aiden reads every message.',
    items: [
      { label: 'Email', value: 'hello@aidentyack.com', href: '' },
      { label: 'Workshop', value: 'San Diego, California', href: '' },
      { label: 'Replies', value: 'Within two working days', href: '' },
    ],
    form: true, topics: 'Sizing question\nOrder status\nRepair or resoling\nWholesale\nSomething else',
    primaryLabel: 'Send Message', primaryHref: '', secondaryLabel: '', secondaryHref: '', note: '',
  })

  // THE MAKER: the portrait band, the story beside Aiden at his bench, then how a piece is made on parchment.
  const makerBand = role('RoleHero', {
    variant: 'full', eyebrow: 'The maker', title: 'One Bench, One Pair of Hands', lead: '',
    image: PHOTO('aiden-hammering-a-strap'), alt: 'Aiden at his workbench, hammering a strap', focus: '30% 35%',
    primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '',
  })
  const makerStory = role('RoleStory', {
    variant: 'split', eyebrow: '', title: '', lead: 'Aiden makes every belt and bracelet himself, in a small workshop in San Diego.',
    items: [
      { text: 'The leather is full-grain vegetable-tanned hide. The hardware is solid brass, nickel or blackened steel. Nothing is outsourced, and nothing is made in batches.' },
      { text: 'Every piece is numbered and signed, and repairs are free for life.' },
    ],
    quote: '', image: PHOTO('aiden-on-his-scooter'), alt: 'Aiden riding his scooter', focus: '90% 35%',
    primaryLabel: 'Shop the Collection', primaryHref: '~/shop', secondaryLabel: 'Order Custom', secondaryHref: '~/custom',
  })
  const process = role('RoleSteps', {
    variant: 'strip', tone: 'surface', eyebrow: 'The process', title: 'How a Piece Is Made', lead: '',
    items: [
      { title: 'Cut', body: 'Each strap is cut from a single hide with a round knife, never a die.' },
      { title: 'Set', body: 'Studs are placed by hand and set with a rawhide mallet, one at a time.' },
      { title: 'Finish', body: 'Edges are burnished with beeswax until they shine. Then it is numbered and signed.' },
    ],
  })

  // CUSTOM: the bracelet band, the three steps of an order, then the brief (the contact form with the order types).
  const customBand = role('RoleHero', {
    variant: 'full', eyebrow: 'Custom orders', title: 'Made to Your Measure',
    lead: 'Your hide, width, hardware and stud pattern. Cut and set by hand for one person.',
    image: PHOTO('blue-studded-bracelet-on-wrist'), alt: 'A blue studded bracelet on a wrist at the workbench', focus: '65% 66%',
    primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '',
  })
  const customSteps = role('RoleSteps', {
    variant: 'timeline', eyebrow: '', title: '', lead: '',
    items: [
      { title: 'Brief', body: 'Tell us what you want. A rough idea is enough.' },
      { title: 'Quote & sketch', body: 'Within three days you get a price, a sketch and leather samples if needed.' },
      { title: 'Made by hand', body: 'A 50% deposit starts the work. Most pieces ship in 3–5 weeks.' },
    ],
  })
  const brief = role('RoleContact', {
    variant: 'split', eyebrow: 'Start here', title: 'The Brief', layout: flush,
    lead: "Custom belts start at $160 and bracelets at $110. Fill in what you know. We'll work out the rest together.",
    items: [],
    form: true, topics: 'A custom belt\nA custom bracelet\nSomething else',
    primaryLabel: 'Send the Brief', primaryHref: '', secondaryLabel: '', secondaryHref: '', note: 'No payment until you approve the quote.',
  })

  // CARE: the page intro, four care cards, then repairs on the pine band with every answer showing.
  const careIntro = role('RoleHero', {
    variant: 'split', eyebrow: 'Care & repairs', title: 'Made to Outlast You',
    lead: 'Good leather needs very little. A few habits keep it supple for decades.',
    image: '', alt: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '',
  })
  const care = role('RoleOfferings', {
    variant: 'cards', eyebrow: '', title: '', lead: '', actionLabel: '', actionHref: '', live: false, layout: flush,
    items: [
      ['Keep it dry', 'If it gets soaked, let it dry slowly at room temperature. Never near a heater.'],
      ['Condition twice a year', 'Rub in a thin coat of beeswax balm with your fingers. Buff with a horsehair brush.'],
      ['Let it rest', 'Rotate belts when you can. Leather keeps its shape better with a day off.'],
      ['Studs', 'Wipe hardware with a dry cloth. Brass darkens over time; a little metal polish brings it back.'],
    ].map(([title, body]) => ({ title, body, price: '', href: '', image: '' })),
  })
  const repairs = role('RoleFaq', {
    variant: 'split', tone: 'band', eyebrow: 'Repairs', title: 'Free for Life', live: false, open: true,
    lead: 'If anything wears out, send it back. Aiden will fix it, no matter how old it is.',
    primaryLabel: 'Start a Repair', primaryHref: '~/visit',
    items: [
      { question: 'What do repairs cover?', answer: 'Loose studs, worn holes, a new keeper or buckle, and edge refinishing. Free for the life of the piece.' },
      { question: 'What does it cost me?', answer: 'Nothing but shipping to the workshop. Return shipping is on us.' },
      { question: 'How long does it take?', answer: 'Most repairs are back in your hands within two weeks.' },
    ],
  })

  // CONTACT: the page intro, then the details and the form.
  const contactIntro = role('RoleHero', {
    variant: 'split', eyebrow: 'Contact', title: 'Get in Touch',
    lead: 'Questions about sizing, an order or a repair. Send a note and Aiden will reply himself.',
    image: '', alt: '', primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '',
  })
  const contact = role('RoleContact', {
    variant: 'card', eyebrow: '', title: '', lead: '', layout: flush,
    items: [
      { label: 'Email', value: 'hello@aidentyack.com', href: '' },
      { label: 'Workshop', value: 'San Diego, California. Visits by appointment.', href: '' },
      { label: 'Replies', value: 'Within two working days.', href: '' },
    ],
    form: true, topics: 'Sizing\nAn order\nRepairs\nWholesale\nSomething else',
    primaryLabel: 'Send Message', primaryHref: '', secondaryLabel: '', secondaryHref: '', note: '',
  })

  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo('Aiden Tyack · Leathersmith', 'Studded belts and bracelets, made by hand in San Diego from vegetable-tanned hide and solid hardware.'), blocks: [hero, shop, band, made, custom, talk] },
    { slug: 'shop', label: 'Shop', seo: seo('Shop', 'Belts and bracelets, each one numbered and signed.'), blocks: [shop, band, custom] },
    { slug: 'custom', label: 'Custom', seo: seo('Custom orders', 'Your hide, width, hardware and stud pattern, cut and set by hand for one person.'), blocks: [customBand, customSteps, brief] },
    { slug: 'about', label: 'The Maker', seo: seo('The maker', 'One bench, one pair of hands: Aiden makes every piece himself in San Diego.'), blocks: [makerBand, makerStory, process] },
    { slug: 'care', label: 'Care', seo: seo('Care and repairs', 'How to keep good leather supple for decades, and free repairs for life.'), blocks: [careIntro, care, repairs] },
    { slug: 'visit', label: 'Contact', seo: seo('Contact', 'Questions about sizing, an order or a repair. Aiden replies himself.'), blocks: [contactIntro, contact] },
  ]
}

export function aidenTyackSiteKit(): SiteKit {
  return {
    id: 'aiden-tyack-site', version: 1, theme: 'AidenTyack', niche: 'general', label: 'Aiden Tyack · the designed site',
    description: 'The site designed for aidentyack.com: the forest hero, the shop with tabs and a price sort, how it is made, custom work, care and contact.',
    accent: AIDEN_TYACK_ACCENTS.walnut.day.accent,
    pages: pages(),
  }
}
