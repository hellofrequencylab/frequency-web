import kitData from '@/lib/themes/designer-kits.json'
import type { KitNiche, KitPage, SiteKit } from './types'

// Designer x the thirteen profile kits of the design system (ui_kits/site/kits.js, carried word for word in
// lib/themes/designer-kits.json). Each profile is a small design business (interior designers, architects, garden
// designers, makers ...) and gets a home in the design's own order: the hero with its frosted project strip, the
// portfolio mosaic, the arch and its steps, the capabilities slab, proof, the founder, the photo band, the
// questions and the closing call, laid out in the Designer blocks that already exist. The photographs are the
// theme's own (/sites/designer/photos, the same fourteen the design ships). All DATA: no block, default or token
// changes, so a saved Designer site renders as it did.
//
// These kits live beside the six niche doors (designer-variants.ts), not over them: `designer-profile-<id>`,
// where <id> is the design system's stable engine key (general, coaches ...), which is also the kit's niche.
//
// Words are the design's. Where the design breaks the voice guide (docs/marketing/voice-and-language-guide.md:
// no invented numbers, no hard claims, no invented testimonials) the guide wins: SOFTEN below lists every line it
// changed, keyed by the design's exact words, and the tests fail if a key stops matching.
// Wrap words in *stars* for the italic.

type Block = KitPage['blocks'][number]
interface KitRow {
  id: string; name: string; who: string; blocks: string[]; cta: { label: string; route: string }; cta2?: { label: string; route: string }
  descriptor: string; image: string; hero: string; labels: Record<string, string>
  copy: Record<string, Record<string, string>>; faqs?: string[][]; offers?: string[][]; events?: string[]
  accent: { base: string; hover: string; text: string; deep: string; soft: string; bg: string; on: string }
}
const DATA = kitData as unknown as { images: Record<string, string>; blocks: Record<string, { fields: Record<string, string> }>; capabilities: string[]; faqs: { q: string; a: string }[]; kits: KitRow[] }

/** The design's lines the voice guide does not allow, and what each one says here instead. Keyed by the design's exact words. */
export const SOFTEN: Record<string, string> = {
  'Twenty minutes, free, to talk about your rooms and timing.': 'A short, free call to talk about your rooms and timing.',
  'Two hours at home and a written plan for one room.': 'A visit at home and a written plan for one room.',
  'Design and permits usually take six to nine months; building takes twelve to eighteen. We give you a schedule at the start.': 'It depends on the site and the permits. We give you a schedule at the start.',
  'Yes, within about two hours. Further away, ask and we will say honestly whether we are the right fit.': 'Often, yes. Ask and we will say honestly whether we are the right fit.',
  'Usually eight to twelve weeks on site, after design and ordering. We give you a week-by-week schedule.': 'It depends on the scope. We give you a week-by-week schedule once the design is agreed.',
  'A free twenty-minute call about your room and timing.': 'A short, free call about your room and timing.',
  'Two hours at home, measurements and a first layout.': 'A visit at home, measurements and a first layout.',
  'Six to eight weeks from the first workshop to final files.': 'It depends on the project. We agree a schedule at the first workshop.',
  'A free twenty-minute call about your business.': 'A short, free call about your business.',
  'Four-week courses for owners who want to run their own site.': 'Short courses for owners who want to run their own site.',
  'Twenty minutes, free, about your site and goals.': 'A short, free call about your site and goals.',
  'Most pieces take eight to twelve weeks from approved drawing to delivery.': 'It depends on the piece. We agree a timeline when the drawing is approved.',
  'A free twenty-minute call about the piece you want.': 'A short, free call about the piece you want.',
  'Nine to twelve months for weddings; a few weeks for dinners.': 'As early as you can. Weddings book up well ahead; dinners need less notice.',
  'Three hours restyling one or two rooms with what you own.': 'A visit to restyle one or two rooms with what you own.',
  'Four visits a year to restyle and rotate.': 'Seasonal visits through the year to restyle and rotate.',
  'Yes. Swatches ship within three working days and the cost comes off your first order.': 'Yes. Swatches ship quickly and the cost comes off your first order.',
  'As early as you like, even before you have plans. A first conversation costs nothing and saves the most money.': 'As early as you like, even before you have plans. A first conversation costs nothing.',
  'Ten years inside every phase of a project, from structural planning to the last cushion, means the results feel cohesive and the process feels calm.': 'Years inside every phase of a project, from structural planning to the last cushion, give us a feel for how the whole thing fits together.',
}
const soft = (s: string): string => SOFTEN[s] ?? s

// The design's shop, membership and letter areas have no Designer block (and carry prices). The route they led to is
// replaced by the nearest page this kit has, and the label follows.
const SHOP_LABELS: Record<string, string> = { 'Shop the pieces': 'See the pieces', 'Shop the collection': 'See the collection' }

type Photo = 'bath-blush' | 'bath-teal' | 'cabinet-detail' | 'courtyard-arch' | 'designer-kitchen-hero' | 'designer-kitchen' | 'designer-sofa' | 'house-front' | 'kitchen-island' | 'kitchen-wide' | 'outdoor-bar' | 'pergola' | 'portrait-01' | 'portrait-02'
const src = (p: Photo) => `/sites/designer/photos/dz-${p}.webp`
// What each photograph shows, for screen readers.
const ALT: Record<Photo, string> = {
  'bath-blush': 'A bright bedroom with black-framed windows and a pale linen bed',
  'bath-teal': 'A designer standing at a walnut and white island in an open living space',
  'cabinet-detail': 'A walnut dining table beside an open kitchen',
  'courtyard-arch': 'A white house with a deep timber porch and a long stone path',
  'designer-kitchen-hero': 'A designer walking through a bright kitchen with an oak island',
  'designer-kitchen': 'An open living room and kitchen with a designer by the island',
  'designer-sofa': 'A designer smiling on a white sofa',
  'house-front': 'A white house with a timber porch, seen from a stone path',
  'kitchen-island': 'A living room and walnut kitchen island under tall black windows',
  'kitchen-wide': 'A wide living room and kitchen with a curved white sofa',
  'outdoor-bar': 'A designer holding flowers in front of a white house under old oak trees',
  pergola: 'A calm living room with a white sofa, framed prints and a timber ceiling',
  'portrait-01': 'A smiling designer in front of a white house',
  'portrait-02': 'A designer talking through material samples with two clients',
}

type Project = [title: string, type: string, photo: Photo]
interface Look {
  /** The hero photograph: one of the high-resolution ones, since it fills the screen. */
  hero: Photo
  projects: [Project, Project, Project]
  /** The arch beside the steps, the proof photo and the band behind the three cards. */
  steps: Photo; proof: Photo; band: Photo; founder: Photo
  /** The capabilities slab, where the profile has one. */
  capabilities?: { names: string[]; tone: 'deep' | 'light'; columns: number }
}

const GENERAL_PROJECTS: Look['projects'] = [['Porch House', 'New home', 'house-front'], ['Walnut Island Kitchen', 'Kitchen remodel', 'kitchen-island'], ['The Gallery House', 'Whole-home renovation', 'bath-teal']]

const LOOK: Record<string, Look> = {
  general: { hero: 'designer-kitchen-hero', projects: GENERAL_PROJECTS, steps: 'portrait-02', proof: 'kitchen-wide', band: 'courtyard-arch', founder: 'portrait-01', capabilities: { names: DATA.capabilities, tone: 'deep', columns: 4 } },
  coaches: { hero: 'designer-sofa', projects: [['Walnut Island Kitchen', 'Kitchen remodel', 'kitchen-island'], ['Quiet Bedroom Suite', 'Bedroom and living', 'bath-blush'], ['The Light Room', 'Living room', 'pergola']], steps: 'portrait-02', proof: 'kitchen-wide', band: 'courtyard-arch', founder: 'portrait-01' },
  studios: { hero: 'courtyard-arch', projects: [['Porch House', 'New home', 'house-front'], ['The Courtyard House', 'New home', 'courtyard-arch'], ['The Light Room', 'Addition', 'pergola']], steps: 'portrait-02', proof: 'kitchen-island', band: 'house-front', founder: 'portrait-01', capabilities: { names: ['Brief and site', 'Concept and drawings', 'Permits and approvals', 'On site until it is built'], tone: 'light', columns: 4 } },
  hosts: { hero: 'kitchen-wide', projects: GENERAL_PROJECTS, steps: 'portrait-02', proof: 'designer-kitchen', band: 'courtyard-arch', founder: 'portrait-01', capabilities: { names: DATA.capabilities, tone: 'deep', columns: 4 } },
  venues: { hero: 'house-front', projects: [['Porch Garden', 'Garden', 'house-front'], ['The Long Walk', 'Paving and hedges', 'courtyard-arch'], ['The Oak Lawn', 'Planting', 'outdoor-bar']], steps: 'courtyard-arch', proof: 'portrait-02', band: 'courtyard-arch', founder: 'portrait-01' },
  nonprofits: { hero: 'kitchen-island', projects: [['Walnut Island Kitchen', 'Kitchen remodel', 'kitchen-island'], ['The Open Kitchen', 'Kitchen and dining', 'kitchen-wide'], ['The Dining Nook', 'Kitchen', 'cabinet-detail']], steps: 'portrait-02', proof: 'designer-kitchen', band: 'kitchen-wide', founder: 'portrait-01', capabilities: { names: ['Layout', 'Cabinetry', 'Tile', 'Lighting', 'Installation', 'Finishing'], tone: 'deep', columns: 3 } },
  networks: { hero: 'portrait-02', projects: [['Your first project', 'Identity', 'cabinet-detail'], ['Your second project', 'Packaging', 'bath-blush'], ['Your third project', 'Print', 'pergola']], steps: 'cabinet-detail', proof: 'kitchen-wide', band: 'courtyard-arch', founder: 'portrait-01' },
  creators: { hero: 'designer-kitchen', projects: [['Your first project', 'Website', 'kitchen-wide'], ['Your second project', 'Shop', 'cabinet-detail'], ['Your third project', 'System', 'pergola']], steps: 'portrait-02', proof: 'kitchen-island', band: 'courtyard-arch', founder: 'portrait-01' },
  schools: { hero: 'bath-teal', projects: [['Plan your kitchen', 'Kitchens', 'kitchen-island'], ['The calm remodel', 'Process', 'house-front'], ['Colour, light and finish', 'Materials', 'bath-blush']], steps: 'portrait-02', proof: 'kitchen-wide', band: 'kitchen-island', founder: 'portrait-01' },
  clubs: { hero: 'kitchen-island', projects: [['The Walnut Island', 'Built-in', 'kitchen-island'], ['The Long Table', 'Made to order', 'cabinet-detail'], ['The Oak Shelves', 'Commission', 'pergola']], steps: 'portrait-02', proof: 'kitchen-wide', band: 'kitchen-island', founder: 'portrait-01' },
  faith: { hero: 'portrait-01', projects: [['Courtyard Dinner', 'Dinner', 'courtyard-arch'], ['Garden Wedding', 'Wedding', 'house-front'], ['Flowers on the Lawn', 'Florals', 'outdoor-bar']], steps: 'portrait-02', proof: 'kitchen-wide', band: 'courtyard-arch', founder: 'designer-sofa' },
  wellness: { hero: 'kitchen-wide', projects: [['The Kitchen, restyled', 'Refresh', 'kitchen-wide'], ['Quiet Bedroom', 'Staging', 'bath-blush'], ['Living Room Refresh', 'Styling', 'pergola']], steps: 'portrait-02', proof: 'designer-kitchen', band: 'kitchen-island', founder: 'portrait-01' },
  markets: { hero: 'designer-sofa', projects: [['The Linen Living Room', 'Collection', 'kitchen-wide'], ['The Linen Bedroom', 'Bedding', 'bath-blush'], ['Made-to-order Cushions', 'Soft goods', 'pergola']], steps: 'portrait-02', proof: 'kitchen-island', band: 'kitchen-island', founder: 'portrait-01' },
}

/** Words wrapped in stars are the italic. The design's title and its italic ending ("title" + "em") read as one line. */
const star = (title: string, em: string): string => [title, em ? `*${em}*` : ''].filter(Boolean).join(' ')
const para = (text: string): string => text.split('\n').map(soft).join('\n\n')

function field(row: KitRow, block: string, name: string): string {
  const own = row.copy[block]?.[name]
  return soft(own ?? DATA.blocks[block]?.fields[name] ?? '')
}

function routeHref(row: KitRow, route: string, has: Set<string>): string {
  switch (route) {
    case 'book': return '~/consultation'
    case 'portfolio': return has.has('portfolio') ? '~/portfolio' : '~/about'
    case 'journeys': return '~/courses'
    case 'workshops': return '~/events'
    default: return has.has('portfolio') ? '~/portfolio' : '~/about'
  }
}

function pageSet(row: KitRow): Set<string> {
  const has = new Set(['home', 'about', 'project', 'consultation'])
  if (row.blocks.includes('portfolio')) has.add('portfolio')
  if (row.blocks.includes('gatherings') || row.cta2?.route === 'workshops') has.add('events')
  if (row.id === 'schools') has.add('courses')
  return has
}

function offerItems(row: KitRow): Block {
  const items = (row.offers ?? []).map(([title, blurb]) => ({ title: soft(title), blurb: soft(blurb) }))
  return { type: 'SpaceOfferings', props: { eyebrow: row.copy.offerings?.eyebrow ?? 'Services', heading: [row.copy.offerings?.title ?? 'Ways to', row.copy.offerings?.em ?? 'work together'].join(' '), items } }
}

function sections(row: KitRow, look: Look, has: Set<string>): Block[] {
  const cta = { label: SHOP_LABELS[row.cta.label] ?? row.cta.label, href: routeHref(row, row.cta.route, has) }
  const cta2 = row.cta2 ? { label: SHOP_LABELS[row.cta2.label] ?? row.cta2.label, href: routeHref(row, row.cta2.route, has) } : null
  const out: Block[] = []
  for (const id of row.blocks) {
    switch (id) {
      case 'hero':
        out.push({
          type: 'DesignerHero',
          props: {
            size: row.hero === 'full' ? 'full' : 'page', image: src(look.hero), alt: ALT[look.hero],
            eyebrow: field(row, 'hero', 'eyebrow'), title: star(field(row, 'hero', 'title'), field(row, 'hero', 'em')), lead: field(row, 'hero', 'body'),
            primaryLabel: cta.label, primaryHref: cta.href, secondaryLabel: cta2?.label ?? '', secondaryHref: cta2?.href ?? '',
            strip: look.projects.map(([title, type, photo]) => ({ label: type, value: title, image: src(photo), href: row.id === 'schools' ? '~/courses' : '~/portfolio' })),
          },
        })
        break
      case 'portfolio':
        out.push({
          type: 'DesignerPortfolio',
          props: {
            eyebrow: field(row, 'portfolio', 'eyebrow'), title: star(field(row, 'portfolio', 'title'), field(row, 'portfolio', 'em')), lead: field(row, 'portfolio', 'kicker'),
            projects: look.projects.map(([title, type, photo]) => ({ image: src(photo), title, location: type, year: '', href: '~/portfolio' })),
          },
        })
        break
      case 'offerings':
      case 'journeys':
        out.push(id === 'offerings' ? offerItems(row) : { type: 'SpaceOfferings', props: { eyebrow: field(row, 'journeys', 'eyebrow'), heading: [field(row, 'journeys', 'title'), field(row, 'journeys', 'em')].join(' '), items: [] } })
        break
      case 'steps': {
        const f = (n: string) => field(row, 'steps', n)
        const own = !!row.copy.steps
        out.push({
          type: 'DesignerSteps',
          props: {
            image: src(look.steps), alt: ALT[look.steps], eyebrow: f('eyebrow'), title: star(f('title'), f('em')),
            steps: [1, 2, 3].map((n) => ({ title: f(`s${n}t`), lead: own && !row.copy.steps[`s${n}l`] ? '' : f(`s${n}l`), body: f(`s${n}b`) })),
          },
        })
        break
      }
      case 'capabilities':
        if (look.capabilities) {
          out.push({
            type: 'DesignerServices',
            props: {
              eyebrow: field(row, 'capabilities', 'eyebrow'), title: star(field(row, 'capabilities', 'title'), field(row, 'capabilities', 'em')), lead: '', tone: look.capabilities.tone,
              columns: look.capabilities.columns, services: look.capabilities.names.map((name) => ({ name })), buttonLabel: 'About our team', buttonHref: '~/about', closing: '', closingLabel: '', closingHref: '',
            },
          })
        }
        break
      case 'proof':
        out.push({
          type: 'DesignerTestimonials',
          props: { eyebrow: field(row, 'proof', 'eyebrow'), items: [{ quote: 'Add a few kind words from someone you have worked with. Their own words land better than ours.', author: 'A happy client', image: src(look.proof) }] },
        })
        break
      case 'founder':
        out.push({
          type: 'DesignerFounder',
          props: {
            eyebrow: field(row, 'founder', 'eyebrow'), title: star(field(row, 'founder', 'title'), field(row, 'founder', 'em')), lead: field(row, 'founder', 'lead'), paragraphs: para(field(row, 'founder', 'body')),
            buttonLabel: 'Learn more about me', buttonHref: '~/about', image: src(look.founder), alt: ALT[look.founder], quote: field(row, 'founder', 'quote'), quoteBy: field(row, 'founder', 'by'),
          },
        })
        break
      case 'band': {
        const f = (n: string) => field(row, 'band', n)
        out.push({
          type: 'DesignerBand',
          props: {
            image: src(look.band), alt: ALT[look.band], eyebrow: f('eyebrow'), title: star(f('title'), f('em')),
            cards: [1, 2, 3].map((n) => ({ title: f(`c${n}t`), lines: `${f(`c${n}a`)}\n${f(`c${n}b`)}` })),
            buttonLabel: f('cta'), buttonHref: '~/consultation',
          },
        })
        break
      }
      case 'gatherings':
        out.push({ type: 'SpaceEvents', props: { eyebrow: field(row, 'gatherings', 'eyebrow'), heading: [field(row, 'gatherings', 'title'), field(row, 'gatherings', 'em')].join(' ') } })
        break
      case 'faq': {
        const items = row.faqs ? row.faqs.map(([q, a]) => ({ q, a: soft(a) })) : DATA.faqs.map((x) => ({ q: x.q, a: soft(x.a) }))
        out.push({ type: 'DesignerFAQ', props: { title: [field(row, 'faq', 'title'), field(row, 'faq', 'em')].join(' '), contactLabel: 'Say hello', phone: '', email: '', buttonLabel: cta.label, buttonHref: cta.href, items } })
        break
      }
      case 'cta':
        out.push({
          type: 'DesignerClosing',
          props: { title: star(field(row, 'cta', 'title'), field(row, 'cta', 'em')), buttonLabel: cta.label, buttonHref: cta.href, nextEyebrow: '', next: { image: '', title: '', location: '', year: '', href: '' } },
        })
        break
      case 'letter':
        out.push({ type: 'SpaceJoinList', props: { eyebrow: 'Stay close', title: [field(row, 'letter', 'title'), field(row, 'letter', 'em')].join(' '), body: field(row, 'letter', 'body'), submitLabel: 'Join the list', successMessage: 'You are on the list. Thank you.' } })
        break
      default:
        // live, doors, shop, membership, library: the design's own shop and membership carry prices and have no Designer block.
        break
    }
  }
  return out
}

const shortHero = (eyebrow: string, title: string, lead = ''): Block => ({
  type: 'DesignerHero',
  props: { size: 'short', image: '', alt: '', eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', strip: [] },
})

function pages(row: KitRow): KitPage[] {
  const look = LOOK[row.id]
  const has = pageSet(row)
  const cta = { label: SHOP_LABELS[row.cta.label] ?? row.cta.label, href: routeHref(row, row.cta.route, has) }
  const services = (look.capabilities?.names ?? (row.offers ?? []).map((o) => o[0])).join('\n') || 'Planning\nDesign\nBuild'
  const closing = DATA.blocks.cta.fields
  const closingBlock = (): Block => ({ type: 'DesignerClosing', props: { title: star(field(row, 'cta', 'title') || closing.title, field(row, 'cta', 'em') || closing.em), buttonLabel: cta.label, buttonHref: cta.href, nextEyebrow: '', next: { image: '', title: '', location: '', year: '', href: '' } } })
  const list: KitPage[] = [
    { slug: 'home', label: 'Home', seo: { title: row.name, description: row.who }, blocks: sections(row, look, has) },
  ]
  if (has.has('portfolio')) {
    list.push({
      slug: 'portfolio', label: 'Portfolio', seo: { title: 'Portfolio', description: 'Recent projects, and what it took to get each one right.' },
      blocks: [
        shortHero('Portfolio', 'Our *work*'),
        { type: 'DesignerPortfolio', props: { eyebrow: '', title: '', lead: '', projects: look.projects.map(([title, type, photo]) => ({ image: src(photo), title, location: type, year: '', href: '~/portfolio' })) } },
        closingBlock(),
      ],
    })
  }
  if (has.has('courses')) {
    list.push({
      slug: 'courses', label: 'Courses', seo: { title: 'Courses', description: 'Short courses for people planning their own home.' },
      blocks: [shortHero(field(row, 'journeys', 'eyebrow') || 'Courses', star(field(row, 'journeys', 'title') || 'Plan your own home', field(row, 'journeys', 'em') || ''), field(row, 'journeys', 'kicker')), { type: 'SpaceOfferings', props: { eyebrow: 'Courses', heading: 'What is on offer', items: [] } }, closingBlock()],
    })
  }
  if (has.has('events')) {
    list.push({
      slug: 'events', label: row.labels.workshops ?? 'Events', seo: { title: row.labels.workshops ?? 'Events', description: 'Every upcoming date.' },
      blocks: [shortHero(row.labels.workshops ?? 'Events', 'Come and *see*', row.copy.gatherings?.kicker ?? 'Open evenings, small workshops and tours of finished projects.'), { type: 'SpaceEvents', props: {} }, closingBlock()],
    })
  }
  list.push(
    {
      slug: 'about', label: 'About', seo: { title: 'About', description: 'Who we are and how we do things.' },
      blocks: [
        shortHero('About', 'A team that takes you from *start to finish.*'),
        { type: 'DesignerStatement', props: { eyebrow: 'Who we are', title: '', lead: row.who, meta: row.descriptor, linkLabel: '', linkHref: '' } },
        { type: 'DesignerFounder', props: { eyebrow: field(row, 'founder', 'eyebrow'), title: star(field(row, 'founder', 'title'), field(row, 'founder', 'em')), lead: field(row, 'founder', 'lead'), paragraphs: para(field(row, 'founder', 'body')), buttonLabel: '', buttonHref: '', image: src(look.founder), alt: ALT[look.founder], quote: field(row, 'founder', 'quote'), quoteBy: field(row, 'founder', 'by') } },
        { type: 'SpaceContact', props: { heading: 'Say hello' } },
      ],
    },
    {
      slug: 'project', label: 'Start a project', seo: { title: 'Start a project', description: 'Tell us what you have in mind.' },
      blocks: [{ type: 'DesignerInquiry', props: { variant: 'project', eyebrow: 'Start a project', title: star(field(row, 'cta', 'title'), field(row, 'cta', 'em')), paragraphs: 'Tell us a little about what you have in mind and we will be in touch to find a time.', image: src(look.proof), alt: ALT[look.proof], services, submitLabel: 'Send', successTitle: 'We look forward to speaking with you.', successBody: 'We will be in touch shortly to schedule a time.' } }],
    },
    {
      slug: 'consultation', label: 'Consultation', seo: { title: 'Consultation', description: 'Book a first conversation.' },
      blocks: [{ type: 'DesignerInquiry', props: { variant: 'consult', eyebrow: 'Schedule a consultation', title: 'Book a *consultation*', paragraphs: 'Tell us a little about what you have in mind and we will be in touch to find a time.', image: '', alt: '', services, submitLabel: 'Send', successTitle: 'We look forward to speaking with you.', successBody: 'We will be in touch shortly to schedule a time.' } }],
    },
  )
  return list
}

/** The design system's profile ids, in its order. */
export const DESIGNER_PROFILES = DATA.kits.map((k) => k.id)

/** The profile's accent, from the design system's tokens/kits.css. Kits hold no colours: the Space's own brand accent paints it. */
export const designerProfileAccent = (niche: string) => DATA.kits.find((k) => k.id === niche)?.accent ?? null

/** The Designer profile kit for one of the design system's thirteen profiles. Id is `designer-profile-<niche>`. */
export function designerProfileKit(niche: KitNiche): SiteKit {
  const row = DATA.kits.find((k) => k.id === niche)
  if (!row) throw new Error(`No Designer profile kit for ${niche}`)
  return { id: `designer-profile-${niche}`, label: row.name, description: row.who, theme: 'Designer', version: 1, niche, pages: pages(row) }
}
