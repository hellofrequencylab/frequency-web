// ALLI RAE BUILD + DESIGN, ON THE DESIGNER THEME. PURE: the firm's pages as Designer blocks, so the seed script
// and the tests share one source. The words are the firm's own, from alliraebuilddesign.com (crawled Oct 2026,
// handed over in the Alli Rae Build + Design system), with the source's typos corrected (owner ruling 2026-10-27) and no em dashes. The photos are the
// firm's project photography ("Projects captured by Pixels & Pigment"), served from /sites/alli-rae/.
//
// Layout follows the design's page assembly: Home, About, three projects, Ready to Build Meeting and Book a
// Consultation, plus a Portfolio page that lists the three. Links start with `~/` for a page of this site.

import type { WebsiteEditorState, WebsiteSnapshot } from '@/lib/sites/editor/state'
import {
  DESIGNER_BAND, DESIGNER_CLOSING, DESIGNER_FAQ, DESIGNER_FOUNDER, DESIGNER_GALLERY, DESIGNER_HERO, DESIGNER_INQUIRY, DESIGNER_PORTFOLIO,
  DESIGNER_QUOTE, DESIGNER_SERVICES, DESIGNER_STATEMENT, DESIGNER_STEPS, DESIGNER_TESTIMONIALS, type DesignerPageSeed,
} from './designer-home.ts'

/** The Space's address name: alliraebuilddesign.frequencylocal.com (owner ask 2026-10-27; the first seed used alli-rae). */
export const ALLI_RAE_SLUG = 'alliraebuilddesign'
const IMG = '/sites/alli-rae'
const i = (name: string) => `${IMG}/${name}.webp`

/** The suite, written as a hash and the number so no source line reads as a hex colour. */
const ADDRESS_UNIT = `${'#'}112`

export const ALLI_RAE = {
  name: 'Alli Rae Design & Build',
  tagline: 'We create Spaces that balance beauty, structure, and soul.',
  license: 'CSLB# 1120126',
  address: `450 S. Melrose Drive ${ADDRESS_UNIT}, Vista, CA 92081`,
  email: 'alli@alliraebuilddesign.com',
  phone: '(760) 707-6401',
  hours: 'Mon – Fri · 7am – 6pm',
  instagram: 'https://www.instagram.com/allirae_build_design/',
  facebook: 'https://www.facebook.com/profile.php?id=61577030431156',
  logo: `${IMG}/logo-header.webp`,
  credit: 'Projects captured by Pixels & Pigment',
} as const

const SERVICES = ['Due Diligence + Planning', 'Permitting + Entitlements', 'Architectural Layouts', 'Landscape Design', 'Interior Design', 'General Construction', 'Owner Representation', 'Hourly Consulting']

interface Project { slug: string; title: string; pageTitle: string; location: string; year: string; image: string; body: string; details: string[]; gallery: string[]; cta?: string }

const PROJECTS: Project[] = [
  {
    slug: 'spanish-modern-custom-home', title: 'Custom Spanish Modern Residence', pageTitle: 'New Ground-Up Spanish Modern Custom Home', location: 'Sunset Cliffs San Diego, CA', year: '2025', image: i('sunset-cliffs-hero'),
    body: 'This modern charmer on Sunset Cliffs was designed and built with a high level of intention for each space. Our team provided permit expediting, architectural finishes, interior design, landscape design and construction. Featuring many luxury upgrades throughout and customization by local artisans work from the stained glass, railing design, driveway gate, wine cellar gate and beams. Not to forget the one-of-a-kind, hand-carved mother-of-pearl inlay custom front door and carriage doors specifically made for this home!',
    details: ['Interior', 'Exterior'], gallery: [i('testimonial-vacation-home'), i('about-team'), i('outdoor-garden')],
  },
  {
    slug: 'mid-century-modern-bathroom-remodel', title: 'Mid Century Modern Bathroom Remodel', pageTitle: 'Mid Century Modern Bathroom Remodel', location: 'Rancho Bernardo, CA', year: '2023', image: i('bath-hero'),
    body: 'This client brought us bold ideas, a love for flowers and petals. We transformed these two distinct spaces by incorporating her ideas to a mid-century modern design that conveys a feeling of a bold, lively and clean. This remodel included wood-like tile flooring throughout the upstairs and a fresh coat of paint to refresh the bedrooms and hall to update the whole space. The exclusive brass fixtures and custom shower drain just elevates this mid-century design to fun!',
    details: ['Vanity', 'Faucet', 'Shower Fixture', 'Niche', 'Custom Drain'], gallery: [i('testimonial-pink-bath')], cta: 'Interested in refreshing your own bathroom?',
  },
  {
    slug: 'breezy-island-kitchen-remodel', title: 'Breezy Kitchen Remodel', pageTitle: 'Breezy Island Kitchen Remodel', location: 'La Jolla, CA', year: '2024', image: i('kitchen-hero'),
    body: "This kitchen remodel with its custom wrapped beams and a tropical floral wallpaper with flanking blue sconces evokes the island’s sea salt breeze feeling. This kitchen features panel-ready appliances, a new oversized walk-in pantry with a frosted glass door and its oversized island is perfect for entertainment and storage!",
    details: ['Focal Wall', 'La Jolla Kitchen', 'Greenspacing', 'Dog Station', 'Beverage Fridge'], gallery: [i('hero-kitchen'), i('testimonial-kitchen')],
  },
]

const card = (p: Project) => ({ image: p.image, title: p.title, location: p.location, year: p.year, href: `~/${p.slug}` })
const DEFAULTS: Record<string, Record<string, unknown>> = {
  DesignerHero: DESIGNER_HERO, DesignerStatement: DESIGNER_STATEMENT, DesignerPortfolio: DESIGNER_PORTFOLIO, DesignerSteps: DESIGNER_STEPS, DesignerServices: DESIGNER_SERVICES,
  DesignerTestimonials: DESIGNER_TESTIMONIALS, DesignerFounder: DESIGNER_FOUNDER, DesignerBand: DESIGNER_BAND, DesignerFAQ: DESIGNER_FAQ, DesignerQuote: DESIGNER_QUOTE,
  DesignerGallery: DESIGNER_GALLERY, DesignerClosing: DESIGNER_CLOSING, DesignerInquiry: DESIGNER_INQUIRY,
}
const b = (type: string, props: Record<string, unknown>) => ({ type, props: { ...(DEFAULTS[type] ?? {}), ...props } })

const FAQS = [
  { q: 'How early should we bring you into the process?', a: 'As early as possible, even before architectural plans are finalized. We can help shape the vision, streamline decision-making, and ensure that your design choices are realistic for the build. Whether you’re starting with a blank slate or halfway through, we’ll meet you where you are.' },
  { q: 'Do I need to have plans or an architect first?', a: 'Not at all. Many of our clients come to us with only a vision. We help fill in the blanks. We can collaborate with your architect or bring in our own design team to develop your home from the ground up. To ensure a seamless experience we recommend using our team, that way, any changes are dealt with effortlessly.' },
  { q: 'What’s your typical project size or scope?', a: 'We specialize in full-home custom homes, remodels and large renovations. While every project is unique, most of our work ranges from $1M to $5M+. If you\'re not sure where yours fits, we’re happy to talk through it.' },
  { q: 'How involved will I need to be in the process?', a: 'That’s entirely up to you. Some clients love picking every finish; others want full trust and minimal meetings. We offer clear guidance, curated options, and full project oversight, so you’re never overwhelmed, just supported.' },
  { q: 'What services do you offer in-house?', a: `We know there’s many layers and details to bringing a vision to life, that’s why our expert team and vast network offers a robust amount of services to cover your every need. Collaboration, communication and expertise is key to a timely and seamless design and build out of a project, so we offer it all in-house start to finish.`, list: SERVICES.join('\n') },
]

const hero = (image: string, eyebrow: string, title: string, lead: string, strip: { label: string; value: string }[], extra: Record<string, unknown> = {}) =>
  b('DesignerHero', { size: 'full', image, alt: '', eyebrow, title, lead, primaryLabel: '', primaryHref: '', secondaryLabel: '', secondaryHref: '', strip: strip.map((s) => ({ ...s, image: '', href: '' })), ...extra })

const home = () => [
  hero(i('hero-kitchen'), 'San Diego Design + Build', 'We create Spaces that balance beauty, structure, *and soul.*',
    'A San Diego-based Design & Build firm specializing in custom homes and commercial spaces designed to reflect the people inside them.', [],
    { primaryLabel: 'Build With Us', primaryHref: '~/ready-to-build', secondaryLabel: 'View Portfolio', secondaryHref: `~/${PROJECTS[0].slug}`, strip: PROJECTS.map((p) => ({ label: p.location.replace(' San Diego', ''), value: p.title, image: p.image, href: `~/${p.slug}` })) }),
  b('DesignerPortfolio', { eyebrow: 'Portfolio', title: 'From Permits *To Pillows*', lead: 'It all begins with an idea and a vision, we take your vision from permits to pillows to ensure a seamless experience.', projects: PROJECTS.map(card) }),
  b('DesignerSteps', {
    image: i('process-interior'), alt: '', eyebrow: 'Our Approach', title: 'How We Bring Your Vision To Life',
    steps: [
      { title: 'Design-First Thinking', lead: 'Every project begins with vision: yours, clarified through ours.', body: 'We start with the way you live, how you want to feel in your space, and what will make it not just beautiful, but personal. Layouts, finishes, flow, and feel are shaped with intention long before a crew ever sets foot on-site.' },
      { title: 'Builder-Level Execution', lead: 'Because design without execution is just a wish.', body: 'With deep construction knowledge and hands-on field experience, we know how to speak the language of permits, inspectors, and trades, and we know how to protect your design integrity every step of the way. What we draw, we build.' },
      { title: 'Start-to-Finish Support', lead: 'From first sketch to final styling, we stay with you through it all.', body: 'Whether you’re starting with a vision or a full plan set, we become your anchor: one team, one process, one result. No handoffs. No lost details. Just a seamless, guided experience that ends with a home you love.' },
    ],
  }),
  b('DesignerServices', { eyebrow: 'Our Capabilities', title: 'Everything in-house, *start to finish.*', lead: '', tone: 'deep', columns: 4, services: SERVICES.map((name) => ({ name })), buttonLabel: 'About Our Team', buttonHref: '~/about', closing: '' }),
  b('DesignerTestimonials', {
    eyebrow: 'Testimonials',
    items: [
      { quote: 'We wanted both of our bathrooms to have a unique style and Alli helped us set a vibe in each one!', author: 'Matt H.', image: i('testimonial-pink-bath') },
      { quote: "I built a new vacation home with Alli Rae and I didn't want to leave!", author: 'John P.', image: i('testimonial-vacation-home') },
      { quote: 'She made my kitchen the gathering spot for entertaining guests and found a way to give me a walk-in pantry!', author: 'Trinity P.', image: i('testimonial-kitchen') },
    ],
  }),
  b('DesignerFounder', {
    eyebrow: 'Meet the Founder', title: 'Led by Vision. Grounded in Execution.', lead: '*Alli Rae* blends creative vision with construction fluency, a rare combination in the world of custom homebuilding.',
    paragraphs: 'With over a decade inside every phase of the process, from permitting and structural planning to finish selections and furniture placement, she leads with design, but builds with discipline.\n\nThat’s what makes the results feel so cohesive, and the process feel surprisingly calm.\n\nShe founded Alli Rae Build + Design to be the kind of firm she wished existed. One where the vision is clear, the communication is steady, and the experience is as beautiful as the outcome.',
    buttonLabel: 'Learn More About Me', buttonHref: '~/about', image: i('alli-rae-portrait'), alt: 'Alli Rae, founder', quote: 'She leads with design, but builds with discipline.', quoteBy: 'Alli Rae, Founder',
  }),
  b('DesignerBand', {
    image: i('outdoor-garden'), alt: '', eyebrow: 'The Experience', title: 'Bring Your Vision To Reality',
    cards: [
      { title: 'Dream it', lines: 'Imagine your ideal home.\nWhere is it? What does it feel like when you walk in?\nWhere does your family gather at the end of the day?\nWhere do guests pause and say, “Wow”?\nWe guide you through every detail, from flow to feeling, to help shape the vision you didn’t know you had.' },
      { title: 'Build it', lines: 'We take the dream and bring it to life, one thoughtful choice at a time.\nFrom tile selections to lighting warmth, cabinetry lines to throw pillows, you’ll be involved in what matters without carrying the weight of it all.\nWith design clarity and builder precision, we make sure the finished home reflects the intention behind it.' },
      { title: 'Experience it', lines: 'Step inside a space that feels fully yours.\nNot just a house, but a home shaped around your rhythms, your rituals, your way of living.\nIt’s not just the outcome.\nIt’s the experience of seeing your dream come to life: beautifully, seamlessly, and fully lived in.' },
    ],
    buttonLabel: 'Bring My Project to Life', buttonHref: '~/ready-to-build',
  }),
  b('DesignerFAQ', { title: 'FAQs', contactLabel: 'Contact Us', phone: ALLI_RAE.phone, email: ALLI_RAE.email, buttonLabel: 'Schedule Consultation', buttonHref: '~/book-a-consultation', items: FAQS }),
]

const about = () => [
  hero(i('about-team'), 'About', 'A Design + Build Firm that takes you from *Permits to Pillows.*', 'Your experience before, during and after should be navigated with ease and excitement as if you were opening your front door for the first time.',
    [{ label: 'Based in', value: 'Vista, CA' }, { label: 'License', value: ALLI_RAE.license }, { label: 'Hours', value: ALLI_RAE.hours }],
    { size: 'page', primaryLabel: 'Build Your Dream Now', primaryHref: '~/ready-to-build', secondaryLabel: 'Schedule Consultation', secondaryHref: '~/book-a-consultation' }),
  b('DesignerStatement', { eyebrow: 'Who We Are', title: '', lead: 'When you need a vision, a feeling, an idea translated into reality we come along side you every step of the way. We are the only San Diego Design + Build Firm that has all your needs in-house from permits to pillows.', meta: '', linkLabel: '', linkHref: '' }),
  b('DesignerQuote', { title: 'The same team that makes the vision, builds the vision.', body: 'From the very beginning, the same team that gets to know you personally and makes the vision to transform your space, will be the same team that builds your vision to ensure the end-results you deserve.', image: i('alli-rae-portrait'), alt: 'Alli Rae, founder' }),
  b('DesignerServices', {
    eyebrow: 'In-House', title: 'Services', lead: 'Since collaboration, communication and expertise is key to a seamless design and timely project - we offer it all in-house start to finish. We have expertise in:', tone: 'deep', columns: 4,
    services: SERVICES.map((name) => ({ name: name === 'Hourly Consulting' ? 'Hourly Consultation' : name })), buttonLabel: '', buttonHref: '', closing: 'We look forward to bringing our experienced and passionate team to your project!', closingLabel: 'Build Your Dream Now', closingHref: '~/ready-to-build',
  }),
]

const portfolio = () => [
  hero(i('hero-kitchen'), 'Portfolio', 'From Permits *To Pillows*', 'Three projects, from the first sketch to the last pillow.', [], { size: 'short' }),
  b('DesignerPortfolio', { eyebrow: '', title: '', lead: '', projects: PROJECTS.map(card) }),
  b('DesignerClosing', { title: 'Let’s craft your vision together', buttonLabel: 'Ready to Build Meeting', buttonHref: '~/ready-to-build', nextEyebrow: '', next: { image: '', title: '', location: '', year: '', href: '' } }),
]

const project = (p: Project, idx: number) => {
  const next = PROJECTS[(idx + 1) % PROJECTS.length]
  return [
    hero(p.image, 'Portfolio', p.pageTitle, '', [{ label: 'Location', value: p.location }, { label: 'Completed', value: p.year }, { label: 'Details', value: p.details.slice(0, 3).join(' · ') }], { size: 'page' }),
    b('DesignerStatement', { eyebrow: 'The Project', title: p.title, lead: p.body, meta: p.details.join(' · '), linkLabel: 'Ready to Build Meeting', linkHref: '~/ready-to-build' }),
    b('DesignerGallery', { images: p.gallery.map((image) => ({ image, alt: '' })) }),
    b('DesignerClosing', { title: p.cta ?? 'Let’s craft your vision together', buttonLabel: 'Ready to Build Meeting', buttonHref: '~/ready-to-build', nextEyebrow: 'Next Project', next: card(next) }),
  ]
}

const contact = () => [
  b('DesignerInquiry', {
    variant: 'project', eyebrow: 'Ready to Build Meeting', title: 'Let’s craft your vision *together*',
    paragraphs: 'A Ready to Build Meeting is for you to share your build vision and meet our team of experts. No matter what stage you’re in the process, ideation or ready to break ground, we are here to see it through from permits to pillows. You’ll leave with a project road map and a deeper understanding of our in-house services.\n\nKindly fill out some information below and we will be in touch shortly to schedule a time.',
    image: i('sunset-cliffs-hero'), alt: '', services: SERVICES.join('\n'), submitLabel: 'Submit', successTitle: 'We look forward to speaking with you!', successBody: 'We will be in touch shortly to schedule a time.',
  }),
]

const consult = () => [
  b('DesignerInquiry', {
    variant: 'consult', eyebrow: 'Schedule Consultation', title: 'Book a consultation',
    paragraphs: 'A consultation appointment is meant for our experts to assist you with any specific development, permitting, zoning, planning, design or construction questions you have before or during a project.\n\nWe offer virtual meetings or in-person site walks depending on the matter. This service is available for commercial and residential projects.\n\nOur expert network can assist nationally, so don’t hesitate to reach out.',
    image: i('outdoor-garden'), alt: '', services: SERVICES.join('\n'), submitLabel: 'Request Consultation', successTitle: 'We look forward to speaking with you!', successBody: 'We will be in touch shortly to schedule a time.',
  }),
]

/** The firm's whole site: the design's page assembly. */
export function alliRaeSitePages(): DesignerPageSeed[] {
  return [
    { slug: 'home', title: 'Home', nav: false, seo: { title: 'Alli Rae Design & Build | San Diego Custom Homes', description: 'A San Diego-based Design & Build firm specializing in custom homes, remodels and commercial spaces, from permits to pillows.' }, blocks: home() },
    { slug: 'portfolio', title: 'Portfolio', nav: true, seo: { title: 'Portfolio', description: 'Custom homes and remodels by Alli Rae Design & Build.' }, blocks: portfolio() },
    { slug: 'about', title: 'About', nav: true, seo: { title: 'About', description: 'The only San Diego Design + Build firm with all your needs in-house, from permits to pillows.' }, blocks: about() },
    ...PROJECTS.map((p, idx) => ({ slug: p.slug, title: p.title, nav: false, seo: { title: p.pageTitle, description: p.body.slice(0, 150).replace(/\s+\S*$/, '') + '...' }, blocks: project(p, idx) })),
    { slug: 'ready-to-build', title: 'Ready to Build Meeting', nav: true, seo: { title: 'Ready to Build Meeting', description: 'Share your build vision and meet our team of experts.' }, blocks: contact() },
    { slug: 'book-a-consultation', title: 'Schedule Consultation', nav: false, seo: { title: 'Schedule Consultation', description: 'Virtual meetings or in-person site walks with our experts.' }, blocks: consult() },
  ]
}

/** The footer the design sets: contact, follow, and the hours as the note. Addresses and numbers open the site's own
 *  contact page (a footer link may be a path or https only). */
export const ALLI_RAE_FOOTER = {
  logo: `${IMG}/logo-build-design.webp`,
  blurb: ALLI_RAE.license,
  copyright: '© Alli Rae Build + Design Inc.',
  line: ALLI_RAE.credit,
  columns: [
    { title: 'Contact Us', lines: ['450 S. Melrose Drive', ADDRESS_UNIT, 'Vista, CA 92081'], links: [{ label: ALLI_RAE.email, href: `mailto:${ALLI_RAE.email}` }, { label: ALLI_RAE.phone, href: 'tel:7607076401' }] },
    { title: 'Hours', lines: ['Mon – Fri', '7am – 6pm'] },
    { title: 'Follow', links: [{ label: 'Instagram', href: ALLI_RAE.instagram }, { label: 'Facebook', href: ALLI_RAE.facebook }] },
  ],
  band: {
    title: 'Let’s craft your vision *together*',
    ctas: [{ label: 'Ready to Build Meeting', href: `/spaces/${ALLI_RAE_SLUG}/ready-to-build` }, { label: 'Schedule Consultation', href: `/spaces/${ALLI_RAE_SLUG}/book-a-consultation` }],
  },
  subscribe: {
    title: 'Subscribe',
    body: 'Sign up to receive trending design inspiration and construction trade tips for homeowners.',
    fine: 'We respect your privacy and do not sell your information.',
    button: 'Sign Up',
    placeholder: 'Email Address',
    success: 'Thank you we look forward to cultivating inspiration for you!',
  },
  utility: {
    left: `${ALLI_RAE.license} · Vista, CA`,
    items: [{ label: ALLI_RAE.hours }, { label: ALLI_RAE.phone, href: 'tel:7607076401' }, { label: ALLI_RAE.email, href: `mailto:${ALLI_RAE.email}` }],
  },
} as const

/** The saved Space menu the design's header draws: Contact and Portfolio are dropdowns (a title and a line each), About
 *  is a plain link. `known` lists every page so the three project pages and the consultation page stay out of the
 *  top bar until Alli adds them herself. */
/** The design's Portfolio dropdown: its own order, titles and lines (not the home cards' titles). */
const MENU_PROJECTS = [
  { slug: 'mid-century-modern-bathroom-remodel', label: 'Mid Century Modern Bathroom Remodel', desc: 'Rancho Bernardo, CA · 2023' },
  { slug: 'breezy-island-kitchen-remodel', label: 'Breezy Island Kitchen Remodel', desc: 'La Jolla, CA · 2024' },
  { slug: 'spanish-modern-custom-home', label: 'Spanish Modern Custom Home', desc: 'Sunset Cliffs, CA · 2025' },
]

export const ALLI_RAE_MENU = {
  v: 1 as const,
  items: [
    {
      id: 'contact', label: 'Contact', visibility: 'website' as const,
      children: [
        { label: 'Ready to Build Meeting', desc: 'Share your build vision and meet our team', target: { kind: 'auto' as const, key: 'page:ready-to-build' } },
        { label: 'Schedule Consultation', desc: 'Virtual meetings or in-person site walks', target: { kind: 'auto' as const, key: 'page:book-a-consultation' } },
      ],
    },
    {
      id: 'portfolio', label: 'Portfolio', visibility: 'website' as const,
      children: MENU_PROJECTS.map((m) => ({ label: m.label, desc: m.desc, target: { kind: 'auto' as const, key: `page:${m.slug}` } })),
    },
    { id: 'about', label: 'About', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:about' } },
  ],
  known: ['home', 'portfolio', 'about', ...PROJECTS.map((p) => p.slug), 'ready-to-build', 'book-a-consultation'].map((k) => `page:${k}`),
}

/** The published website state the editor stores: every page's blocks with stable ids, no comments, one version. */
export function alliRaeEditorState(now: string): WebsiteEditorState {
  const pages = alliRaeSitePages().map((p) => ({
    slug: p.slug,
    label: p.title,
    seo: { ...p.seo! },
    comments: [],
    doc: { root: {}, content: p.blocks.map((b, n) => ({ type: b.type, props: { ...structuredClone(b.props), id: `ar-${p.slug}-${n + 1}` } })) },
  }))
  const snapshot: WebsiteSnapshot = {
    theme: 'Designer',
    brand: { logo: ALLI_RAE.logo, accent: ALLI_RAE_ACCENT },
    chrome: { name: ALLI_RAE.name, tagline: ALLI_RAE.tagline, cta: { label: 'Build Your Dream Now', href: '/ready-to-build' } },
    pages,
  }
  return { v: 1, revision: 1, draft: snapshot, published: structuredClone(snapshot), versions: [{ id: '1', createdAt: now, author: 'Frequency', snapshot: structuredClone(snapshot) }] }
}

/** The firm's ochre, the Designer theme's own accent. */
export const ALLI_RAE_ACCENT = '#D3A03F' // token-ok: the stored brand accent is data, the Designer theme's own ochre (lib/theme/designer.ts)
