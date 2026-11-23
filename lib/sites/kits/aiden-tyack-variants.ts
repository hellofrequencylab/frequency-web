import { AIDEN_TYACK_ACCENTS } from '@/lib/theme/aiden-tyack'
import type { KitPage, SiteKit } from './types'

// The Aiden Tyack starter kit (`aiden-tyack-general`). PRIVATE like its theme: it is in no kit library index, so only a Space that wears
// the theme (aidentyack.com, PRIVATE_THEME_SITES) is ever given it, by id. Words from the handoff's starter-copy.json: coaching copy that
// says what to write, never a made-up number, review or promise (the stats ship as "00"). Headings are Title Case, as the theme's
// blackletter is never set in caps.
//
// BLOCKS. Until the theme cuts its own, the pages are built from the Services block family (components/page-editor/blocks/services.tsx),
// which the Aiden Tyack skin re-draws (components/sites/aiden-tyack-css.ts), as Mindless and New World do. The first three offers,
// products and people are `{{slot|sample words}}` tokens (lib/spaces/content-slots.ts), so a Space that has filled in its own shows those.
//
// HOUSE VOICE (docs/marketing/voice-and-language-guide.md): no em dashes, no exclamation marks, no emoji; prices are left for the owner.

type Block = KitPage['blocks'][number]

/** The handoff's stand-in photo (assets/photos), named for what it shows. The owner swaps it for his own. */
const PHOTO = (name: string) => `/sites/aiden-tyack/photos/${name}.webp`
/** The redwood silhouette sits only behind the forest hero (rules.md), where the skin keeps it at 40%. Decorative, so no alt. */
const AIDEN_TYACK_SILHOUETTE = '/sites/aiden-tyack/redwood-forest-silhouette.webp'

const slot = (key: string, sample: string) => `{{${key}|${sample}}}`

/** Three pieces, no photos yet: the owner adds a photo of each of his own pieces. */
const PRODUCTS = [0, 1, 2]

function pages(): KitPage[] {
  const hero: Block = {
    type: 'ServicesHero',
    props: {
      look: 'photo', eyebrow: 'What you make, in three words', title: 'Say What You Make *in One Line*',
      lead: 'Who is it for, and what problem does it solve for them? Keep it to two sentences.',
      primaryLabel: 'Shop the work', primaryHref: '~/shop', secondaryLabel: 'Ask for a custom piece', secondaryHref: '~/visit', proof: '',
      image: AIDEN_TYACK_SILHOUETTE, alt: '', panelTitle: 'Get in touch', panelNote: 'A real person answers', offers: [], areas: [],
    },
  }
  const stats: Block = {
    type: 'ServicesTrust',
    props: { items: [['00', 'A number you can stand behind'], ['00', 'Another fact a customer can check'], ['00', 'Keep it honest and specific'], ['One promise', 'Something you always do']].map(([title, line]) => ({ title, line })) },
  }
  const steps: Block = {
    type: 'ServicesSteps',
    props: {
      eyebrow: 'How it works', title: 'Explain *Your Process*', lede: '',
      rows: [['Step one', 'What happens first, and what the customer does.'], ['Step two', 'What you do next, in plain words.'], ['Step three', 'What they receive, and when.']].map(([title, body]) => ({ title, body })),
    },
  }
  const offerings: Block = {
    type: 'ServicesList',
    props: {
      eyebrow: 'What we offer', title: 'Name *What You Sell*', lede: '', buttonLabel: 'Ask about a piece', buttonHref: '~/visit',
      rows: [0, 1, 2].map((i) => ({ meta: 'From $00', name: slot(`offer${i + 1}Title`, 'Offering name'), body: slot(`offer${i + 1}Blurb`, 'One line on who it suits and why.'), price: slot(`offer${i + 1}Price`, 'Set your price'), href: '~/visit' })),
    },
  }
  const shop: Block = {
    type: 'ServicesShop',
    props: {
      eyebrow: 'The shop', title: 'Name Your *Collection*', lede: '', buttonLabel: 'View all', buttonHref: '~/shop',
      rows: PRODUCTS.map(() => ({ meta: '', title: 'Product name', body: 'Material · detail', price: 'Set your price', href: '', image: '', alt: '' })),
    },
  }
  const proof: Block = {
    type: 'ServicesReviews',
    props: {
      eyebrow: 'Kind words', title: 'Let *Customers Speak*', lede: '', proof: '',
      rows: [["Paste a real review here, in the customer's own words.", 'Customer name'], ['Short and specific beats long and general.', 'Customer name'], ['Ask permission before you use a name.', 'Customer name']].map(([quote, who]) => ({ quote, who, what: '' })),
    },
  }
  const faq: Block = {
    type: 'ServicesFaq',
    props: {
      eyebrow: 'Questions', title: 'Answer *the Doubts*', lede: '',
      rows: [['What do people ask before they buy?', 'Answer in two sentences. Be direct.'], ['What worries them about sizing or delivery?', 'Say exactly what happens.'], ['What happens if something goes wrong?', 'Say how you fix it.']].map(([question, answer]) => ({ question, answer })),
      facts: [], areas: [],
    },
  }
  const letter: Block = {
    type: 'ServicesLetter',
    props: { eyebrow: 'Letters', title: 'Offer Something *Worth an Email*', lede: 'Say what people get and how often. No spam promises needed.', buttonLabel: 'Sign up', buttonHref: '~/visit' },
  }
  const cta: Block = {
    type: 'ServicesBand',
    props: { eyebrow: 'Ready?', title: 'Ask for *the Next Step*', primaryLabel: 'Main action', primaryHref: '~/visit', secondaryLabel: '', secondaryHref: '' },
  }
  const story: Block = {
    type: 'ServicesStory',
    props: {
      eyebrow: 'Who you will meet', title: 'Introduce *the Maker*',
      paragraphs: ['Tell people who makes the work and why they care about it. Two or three sentences.', 'Write the one sentence you want people to remember about how you work.'],
      buttonLabel: 'Ask a question', buttonHref: '~/visit', image: PHOTO('rider-portrait'), alt: 'A rider in a leather jacket',
    },
  }
  const people: Block = {
    type: 'ServicesTeam',
    props: { eyebrow: 'The workshop', title: 'Who *Makes It*', lede: '', rows: [['Your name', 'Maker'], ['Name', 'Role'], ['Name', 'Role']].map(([name, role], i) => ({ name: slot(`person${i + 1}Name`, name), role, image: '', alt: '' })) },
  }
  const journal: Block = {
    type: 'ServicesPosts',
    props: { eyebrow: 'Journal', title: 'Share *What You Know*', lede: '', buttonLabel: '', buttonHref: '', rows: [0, 1, 2].map(() => ({ meta: 'Post title', title: 'One line on what the reader will learn.', body: '', price: '', href: '', image: '', alt: '' })) },
  }
  const contact: Block = {
    type: 'ServicesContact',
    props: { eyebrow: 'Contact', title: 'Make It Easy *to Reach You*', lede: 'Say how fast you reply and what to include.', body: '', buttonLabel: 'Send', buttonHref: '~/visit', secondaryLabel: '', secondaryHref: '' },
  }
  const where: Block = {
    type: 'ServicesLocations',
    props: { eyebrow: 'Where', title: 'Find *the Workshop*', lede: 'Your city, or by appointment.', address: slot('address', 'Your city, or by appointment'), phone: slot('phone', 'Your phone'), email: slot('email', 'you@yourdomain.com'), hours: [], areas: [], image: '', alt: '' },
  }
  const seo = (title: string, description: string) => ({ title, description })
  return [
    { slug: 'home', label: 'Home', seo: seo('Your name', 'What you make, in a few words'), blocks: [hero, stats, offerings, steps, shop, proof, cta] },
    { slug: 'shop', label: 'Shop', seo: seo('Shop', 'The collection, with prices in plain sight.'), blocks: [shop, faq, letter] },
    { slug: 'about', label: 'About', seo: seo('About', 'Who makes the work, and how.'), blocks: [story, people, journal, cta] },
    { slug: 'visit', label: 'Contact', seo: seo('Contact', 'How to reach the workshop.'), blocks: [contact, where] },
  ]
}

export function aidenTyackKit(): SiteKit {
  return {
    id: 'aiden-tyack-general', version: 1, theme: 'AidenTyack', niche: 'general', label: 'Aiden Tyack',
    description: 'The workshop: what you make, how it is made, the shop and an easy way to reach you, with words that coach you what to write.',
    accent: AIDEN_TYACK_ACCENTS.walnut.day.accent,
    pages: pages(),
  }
}
