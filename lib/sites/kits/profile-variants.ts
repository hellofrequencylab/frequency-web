import { NICHE_SPECS, type LiveBlock, type NicheSpec } from './niche-spec'
import type { KitNiche, KitPage, SiteKit } from './types'

// Midnight, Network, Temple and Wildheart x the profile niches (general, creators, schools, clubs, faith, wellness,
// markets). The other three themes (Default, Bold, Designer) lay the same words out in their own builders. Here the
// four hand-laid themes get a kit per profile too, WITHOUT a block-by-block page each: the words come from
// niche-spec.ts (written once, house voice), and each theme lays them out in its own blocks. A profile kit is the
// short version of a door kit: Home, the profile's main page, About. The words are the same on every theme, so a
// Space that changes theme keeps its meaning.

type Block = KitPage['blocks'][number]
type Theme = 'Midnight' | 'Network' | 'Temple' | 'Wildheart'

/** Wrap the accent words of a title in stars, the editor's italic mark. A title that lacks them stays as is. */
const star = (title: string, accent: string): string => (accent && title.includes(accent) ? title.replace(accent, `*${accent}*`) : title)

const live = (kind: LiveBlock): Block => {
  switch (kind) {
    case 'offerings': return { type: 'SpaceOfferings', props: {} }
    case 'events': return { type: 'SpaceEvents', props: {} }
    case 'community': return { type: 'SpaceCommunity', props: {} }
    case 'booking': return { type: 'SpaceBooking', props: {} }
  }
}

const contact: Block = { type: 'SpaceContact', props: { heading: 'Say hello' } }
const story = (spec: NicheSpec): Block => ({ type: 'EditorialSection', props: { body: 'prose', media: 'right', eyebrow: 'Our story', title: 'Hi, we are glad you are here.', lead: `{{story|${spec.aboutLead}}}` } })

function page(slug: string, label: string, description: string, blocks: Block[]): KitPage {
  return { slug, label, seo: { title: label, description }, blocks }
}

// MIDNIGHT
const SIGILS = ['moon-new', 'moon-quarter', 'moon-full'] as const
function midnight(spec: NicheSpec): KitPage[] {
  const h = spec.home
  const m = spec.main
  const banner = (eyebrow: string, title: string, lead: string): Block => ({
    type: 'MidnightHero',
    props: { layout: 'banner', eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: '', alt: '' },
  })
  return [
    page('home', 'Home', h.seoDescription, [
      { type: 'MidnightHero', props: { layout: 'center', image: '', alt: '', eyebrow: h.eyebrow, title: star(h.title, h.accent), lead: h.lead, primaryLabel: h.primary.label, primaryHref: h.primary.href, secondaryLabel: h.secondary.label, secondaryHref: h.secondary.href } },
      { type: 'MidnightDoors', props: { eyebrow: h.stepsEyebrow, title: h.stepsTitle, lead: '', doors: h.steps.map((s, i) => ({ sigil: SIGILS[i], title: s.title, body: s.body, href: '' })) } },
      live(h.live),
      { type: 'MidnightFAQ', props: { eyebrow: 'Questions', title: h.faqTitle, lead: '', items: h.faqs } },
      { type: 'MidnightCTA', props: { title: star(h.cta.heading, h.cta.accent), buttonLabel: h.cta.label, buttonHref: h.cta.href } },
    ]),
    page(m.slug, m.label, m.seoDescription, [banner(m.eyebrow, star(m.title, m.accent), m.lead), live(m.live)]),
    page('about', 'About', 'Who we are and how we do things.', [banner('About', '{{name|A small team, on purpose}}', 'Why we do this, and who we do it for.'), story(spec), contact]),
  ]
}

// NETWORK
function network(spec: NicheSpec): KitPage[] {
  const h = spec.home
  const m = spec.main
  return [
    page('home', 'Home', h.seoDescription, [
      { type: 'NetworkHero', props: { image: '', alt: '', featureMatch: '', featureNote: '', proof: '', proofNote: '', faces: [], eyebrow: h.eyebrow, title: star(h.title, h.accent), lead: h.lead, primaryLabel: h.primary.label, primaryHref: h.primary.href, secondaryLabel: h.secondary.label, secondaryHref: h.secondary.href } },
      { type: 'NetworkSteps', props: { eyebrow: h.stepsEyebrow, title: h.stepsTitle, lead: '', steps: h.steps.map((s) => ({ ctaLabel: '', ctaHref: '', ...s })) } },
      live(h.live),
      { type: 'SpaceFAQ', props: { items: h.faqs } },
      { type: 'NetworkBand', props: { eyebrow: 'Join in', title: star(h.cta.heading, h.cta.accent), body: '', countdownTo: '', countdownLabel: '', image: '', alt: '', primaryLabel: h.cta.label, primaryHref: h.cta.href, secondaryLabel: '', secondaryHref: '' } },
    ]),
    page(m.slug, m.label, m.seoDescription, [{ type: 'EditorialSection', props: { body: 'lead', eyebrow: m.eyebrow, title: star(m.title, m.accent), lead: m.lead } }, live(m.live)]),
    page('about', 'About', 'Who we are and how we do things.', [story(spec), contact]),
  ]
}

// TEMPLE
function temple(spec: NicheSpec): KitPage[] {
  const h = spec.home
  const m = spec.main
  return [
    page('home', 'Home', h.seoDescription, [
      { type: 'TempleHero', props: { secondaryLabel: h.secondary.label, secondaryHref: h.secondary.href, facts: [], image: '', alt: '', ticketLabel: 'Coming up', eyebrow: h.eyebrow, title: star(h.title, h.accent), lead: h.lead, primaryLabel: h.primary.label, primaryHref: h.primary.href } },
      { type: 'CardGrid', props: { role: 'feature', columns: 3, eyebrow: h.stepsEyebrow, title: h.stepsTitle, cards: h.steps } },
      live(h.live),
      { type: 'TempleFAQ', props: { eyebrow: 'Questions', title: h.faqTitle, items: h.faqs } },
      { type: 'TempleFollow', props: { eyebrow: 'Stay close', title: star(h.cta.heading, h.cta.accent), lead: '', placeholder: 'you@email.com', buttonLabel: 'Sign me up', successMessage: 'Thanks. You are on the list.' } },
    ]),
    page(m.slug, m.label, m.seoDescription, [
      { type: 'EditorialSection', props: { body: 'lead', eyebrow: m.eyebrow, title: star(m.title, m.accent), lead: m.lead } },
      live(m.live),
    ]),
    page('about', 'About', 'Who we are and how we do things.', [story(spec), contact]),
  ]
}

// WILDHEART
function wildheart(spec: NicheSpec): KitPage[] {
  const h = spec.home
  const m = spec.main
  return [
    page('home', 'Home', h.seoDescription, [
      { type: 'WildheartNowLine' },
      { type: 'PhotoHero', props: { content: 'below', eyebrow: h.eyebrow, title: h.title, subtitle: h.lead, actionPrimaryLabel: h.primary.label, actionPrimaryHref: h.primary.href } },
      { type: 'WildheartOrnament', props: { variant: 'moons', label: '' } },
      { type: 'WildheartMoonPath', props: { label: h.stepsEyebrow, heading: h.stepsTitle, accentWord: '', note: '', steps: h.steps.map((s) => ({ href: '', ...s })) } },
      live(h.live),
      { type: 'SpaceFAQ', props: { items: h.faqs } },
    ]),
    page(m.slug, m.label, m.seoDescription, [{ type: 'EditorialSection', props: { body: 'lead', eyebrow: m.eyebrow, title: m.title, lead: m.lead } }, live(m.live)]),
    page('about', 'About', 'Who we are and how we do things.', [story(spec), contact]),
  ]
}

const BUILDERS: Record<Theme, (spec: NicheSpec) => KitPage[]> = { Midnight: midnight, Network: network, Temple: temple, Wildheart: wildheart }

/** The kit of one hand-laid theme for one niche, from the niche's words. Id is `<prefix>-<niche>`. */
export function profileKit(theme: Theme, niche: KitNiche): SiteKit {
  const spec = NICHE_SPECS[niche]
  return { id: `${theme.toLowerCase()}-${niche}`, label: spec.label, description: spec.description, theme, version: 1, niche, pages: BUILDERS[theme](spec) }
}

const JOIN_LEAD = 'Leave your email and we will let you know what is coming up.'

/** The email sign-up page every General kit carries (slug `join`). Midnight and Temple use their own sign-up blocks;
 *  every other theme uses the neutral Space one. All of them write a lead through the same anonymous door. */
export function joinListPage(theme: SiteKit['theme']): KitPage {
  const seo = 'Join the list to hear what is coming up.'
  if (theme === 'Midnight') {
    return page('join', 'Join the list', seo, [
      { type: 'MidnightHero', props: { layout: 'banner', eyebrow: 'Stay close', title: 'Join the list', lead: JOIN_LEAD, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', image: '', alt: '' } },
      { type: 'MidnightLetter', props: { title: 'Join the list.', em: '', lead: JOIN_LEAD, placeholder: 'you@email.com', buttonLabel: 'Join the list', successMessage: 'You are on the list. Thank you.' } },
    ])
  }
  if (theme === 'Temple') {
    return page('join', 'Join the list', seo, [
      { type: 'EditorialSection', props: { body: 'lead', eyebrow: 'Stay close', title: 'Join the list', lead: JOIN_LEAD } },
      { type: 'TempleFollow', props: { eyebrow: 'Stay close', title: 'Hear what is coming up, first.', lead: '', placeholder: 'you@email.com', buttonLabel: 'Join the list', successMessage: 'You are on the list. Thank you.' } },
    ])
  }
  return page('join', 'Join the list', seo, [{ type: 'SpaceJoinList', props: { eyebrow: 'Stay close', title: 'Join the list', body: JOIN_LEAD, submitLabel: 'Join the list', successMessage: 'You are on the list. Thank you.' } }])
}
