// THE DESIGNER SITE, AS THE DESIGN SETS IT (Alli Rae Build + Design system). PURE: no React, so the editor
// template and the seed script can import it.
//
// Every section of the design is one registered Designer block (components/page-editor/blocks/designer.tsx), in
// the design's order: the hero with its strip, the portfolio mosaic, the arch and its steps, the service slab, the
// testimonials, the founder split, the photo band, the questions, then the closing call. A page lists the blocks
// it shows; copy resolves saved content > these defaults. The words here are plain placeholders in the house
// voice (docs/marketing/voice-and-language-guide.md): a Space replaces them in the editor, and a Space seeded
// from a real business (lib/sites/alli-rae-site.ts) carries its own. No photos, prices or real names.
//
// Links start with `~/` for a page of this site. Wrap words in *stars* to set them in the italic.

interface DesignerBlockSeed { type: string; props: Record<string, unknown> }
interface DesignerPageSeed { slug: string; title: string; nav: boolean; seo?: { title: string; description: string }; blocks: DesignerBlockSeed[] }

export const DESIGNER_HERO = {
  size: 'full',
  image: '',
  alt: '',
  eyebrow: 'Your studio, your city',
  title: 'We make spaces that balance beauty, structure, *and soul.*',
  lead: 'One team from the first sketch to the last detail. Tell us what you are dreaming up and we will take it from there.',
  primaryLabel: 'Start a project',
  primaryHref: '~/contact',
  secondaryLabel: 'See our work',
  secondaryHref: '~/portfolio',
  strip: [
    { label: 'Based in', value: 'Your city', image: '', href: '' },
    { label: 'Licensed', value: 'Add your license number', image: '', href: '' },
    { label: 'Hours', value: 'Mon – Fri · 9am – 5pm', image: '', href: '' },
  ],
}

export const DESIGNER_STATEMENT = {
  eyebrow: 'Who we are',
  title: '',
  lead: 'Say in two plain sentences who you help and what is different about working with you. People read this part first.',
  meta: '',
  linkLabel: '',
  linkHref: '',
}

export const DESIGNER_PORTFOLIO = {
  eyebrow: 'Portfolio',
  title: 'Our work, *start to finish*',
  lead: 'Three projects we are proud of, and what it took to get there.',
  projects: [
    { image: '', title: 'Your first project', location: 'City, State', year: '2025', href: '~/portfolio' },
    { image: '', title: 'Your second project', location: 'City, State', year: '2024', href: '~/portfolio' },
    { image: '', title: 'Your third project', location: 'City, State', year: '2023', href: '~/portfolio' },
  ],
}

export const DESIGNER_STEPS = {
  image: '',
  alt: '',
  eyebrow: 'Our approach',
  title: 'How we bring your vision to life',
  steps: [
    { title: 'Start with how you live', lead: 'Every project begins with you.', body: 'We ask how you want to feel in the space before we draw a line. The plan follows from there.' },
    { title: 'Build what we draw', lead: 'Because design without follow-through is a wish.', body: 'The people who plan the work are the people who see it through, so nothing gets lost on the way.' },
    { title: 'One team, start to finish', lead: 'No handoffs, no lost details.', body: 'You always know who to call and what comes next.' },
  ],
}

export const DESIGNER_SERVICES = {
  eyebrow: 'Our capabilities',
  title: 'Everything in-house, *start to finish.*',
  lead: '',
  tone: 'deep',
  columns: 4,
  services: [{ name: 'Planning' }, { name: 'Design' }, { name: 'Permits' }, { name: 'Build' }],
  buttonLabel: 'About our team',
  buttonHref: '~/about',
  closing: '',
}

export const DESIGNER_TESTIMONIALS = {
  eyebrow: 'Testimonials',
  items: [{ quote: 'Add a few kind words from someone you have worked with. Their own words land better than ours.', author: 'A happy client', image: '' }],
}

export const DESIGNER_FOUNDER = {
  eyebrow: 'Meet the founder',
  title: 'Led by vision. *Grounded in execution.*',
  lead: 'A short line on what you do and why it feels different.',
  paragraphs: 'Tell your story in two or three short paragraphs. Start with what you saw missing, then what you built to fix it.',
  buttonLabel: 'Learn more about me',
  buttonHref: '~/about',
  image: '',
  alt: '',
  quote: 'A line you say a lot, in your own words.',
  quoteBy: 'Your name, Founder',
}

export const DESIGNER_BAND = {
  image: '',
  alt: '',
  eyebrow: 'The experience',
  title: 'Bring your vision to reality',
  cards: [
    { title: 'Dream it', lines: 'Imagine the finished space.\nWhere does everyone gather? What do you notice first?' },
    { title: 'Build it', lines: 'We bring it to life one careful choice at a time.\nYou are involved in what matters, without carrying all of it.' },
    { title: 'Experience it', lines: 'Step inside a space that feels like yours.\nIt is the whole experience, not only the outcome.' },
  ],
  buttonLabel: 'Bring my project to life',
  buttonHref: '~/contact',
}

export const DESIGNER_FAQ = {
  title: 'FAQs',
  contactLabel: 'Contact us',
  phone: '',
  email: '',
  buttonLabel: 'Schedule a consultation',
  buttonHref: '~/consultation',
  items: [
    { q: 'How early should we bring you in?', a: 'As early as you like, even before plans are final. We meet you where you are.' },
    { q: 'Do I need plans or an architect first?', a: 'No. Many people come to us with only an idea, and we fill in the rest.' },
    { q: 'How involved will I need to be?', a: 'As much or as little as you want. You are supported either way.' },
  ],
}

export const DESIGNER_QUOTE = {
  title: 'The same team that makes the vision, builds the vision.',
  body: 'Say what that means for the person hiring you, in one or two plain sentences.',
  image: '',
  alt: '',
}

export const DESIGNER_GALLERY = { images: [{ image: '', alt: '' }] }

export const DESIGNER_CLOSING = {
  title: 'Let us craft your vision together',
  buttonLabel: 'Start a project',
  buttonHref: '~/contact',
  nextEyebrow: 'Next project',
  next: { image: '', title: '', location: '', year: '', href: '' },
}

export const DESIGNER_INQUIRY = {
  variant: 'project',
  eyebrow: 'Start a project',
  title: 'Let us craft your vision *together*',
  paragraphs: 'Tell us a little about what you have in mind and we will be in touch to find a time.',
  image: '',
  alt: '',
  services: 'Planning\nDesign\nPermits\nBuild',
  submitLabel: 'Send',
  successTitle: 'We look forward to speaking with you!',
  successBody: 'We will be in touch shortly to schedule a time.',
}

const b = (type: string, props: Record<string, unknown>): DesignerBlockSeed => ({ type, props })

/** Home: the design's own order. */
export function designerHomeBlocks(): DesignerBlockSeed[] {
  return [
    b('DesignerHero', { ...DESIGNER_HERO }),
    b('DesignerPortfolio', { ...DESIGNER_PORTFOLIO }),
    b('DesignerSteps', { ...DESIGNER_STEPS }),
    b('DesignerServices', { ...DESIGNER_SERVICES }),
    b('DesignerTestimonials', { ...DESIGNER_TESTIMONIALS }),
    b('DesignerFounder', { ...DESIGNER_FOUNDER }),
    b('DesignerBand', { ...DESIGNER_BAND }),
    b('DesignerFAQ', { ...DESIGNER_FAQ }),
  ]
}

/** The whole site: the design's pages, in order. */
export function designerSitePages(): DesignerPageSeed[] {
  const short = (eyebrow: string, title: string, lead = '') => b('DesignerHero', { ...DESIGNER_HERO, size: 'short', eyebrow, title, lead, primaryLabel: '', secondaryLabel: '', strip: [] })
  return [
    { slug: 'home', title: 'Home', nav: false, blocks: designerHomeBlocks() },
    { slug: 'about', title: 'About', nav: true, blocks: [short('About', 'A team that takes you from *start to finish.*'), b('DesignerStatement', { ...DESIGNER_STATEMENT }), b('DesignerQuote', { ...DESIGNER_QUOTE }), b('DesignerServices', { ...DESIGNER_SERVICES })] },
    { slug: 'portfolio', title: 'Portfolio', nav: true, blocks: [short('Portfolio', 'Our *work*'), b('DesignerPortfolio', { ...DESIGNER_PORTFOLIO, eyebrow: '', title: '', lead: '' }), b('DesignerClosing', { ...DESIGNER_CLOSING })] },
    { slug: 'contact', title: 'Contact', nav: true, blocks: [b('DesignerInquiry', { ...DESIGNER_INQUIRY })] },
    { slug: 'consultation', title: 'Consultation', nav: false, blocks: [b('DesignerInquiry', { ...DESIGNER_INQUIRY, variant: 'consult', eyebrow: 'Schedule a consultation', title: 'Book a *consultation*' })] },
  ]
}
