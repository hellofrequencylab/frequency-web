import { NICHE_SPECS, type LiveBlock, type NicheSpec } from './niche-spec'
import type { KitNiche, KitPage, SiteKit } from './types'

// Default (the Frequency look) x the six niche doors. All DATA, in the Default theme's own block vocabulary
// (Hero, FeatureGrid, MediaText, CallToAction) with the shared live Space blocks. Words come from niche-spec.ts.

type Block = KitPage['blocks'][number]

const ICONS = ['Compass', 'Users', 'Sparkles'] as const

const live = (kind: LiveBlock, heading = ''): Block => {
  switch (kind) {
    case 'offerings': return { type: 'SpaceOfferings', props: { eyebrow: 'Ways to work together', heading: heading || 'Offerings' } }
    case 'events': return { type: 'SpaceEvents', props: {} }
    case 'community': return { type: 'SpaceCommunity', props: {} }
    case 'booking': return { type: 'SpaceBooking', props: { heading: '' } }
  }
}

const hero = (p: { eyebrow: string; title: string; accent: string; lead: string; primary?: { label: string; href: string }; secondary?: { label: string; href: string } }): Block => ({
  type: 'Hero',
  props: {
    variant: 'minimal', eyebrow: p.eyebrow, title: p.title, titleAccent: p.accent, subtitle: p.lead, image: '', facts: [], note: '',
    ctaPrimaryLabel: p.primary?.label ?? '', ctaPrimaryHref: p.primary?.href ?? '', ctaSecondaryLabel: p.secondary?.label ?? '', ctaSecondaryHref: p.secondary?.href ?? '',
  },
})

function pages(spec: NicheSpec): KitPage[] {
  const h = spec.home
  const m = spec.main
  return [
    {
      slug: 'home', label: 'Home', seo: { title: h.seoTitle, description: h.seoDescription },
      blocks: [
        hero({ eyebrow: h.eyebrow, title: h.title, accent: h.accent, lead: h.lead, primary: h.primary, secondary: h.secondary }),
        { type: 'FeatureGrid', props: { eyebrow: h.stepsEyebrow, title: h.stepsTitle, titleAccent: '', style: 'icon', columns: '3', items: h.steps.map((s, i) => ({ icon: ICONS[i], image: '', title: s.title, body: s.body, href: '' })) } },
        live(h.live),
        { type: 'EditorialSection', props: { body: 'faq', eyebrow: 'Questions', title: h.faqTitle, accentWord: '', lead: '', faqs: h.faqs } },
        { type: 'CallToAction', props: { eyebrow: '', heading: h.cta.heading, headingAccent: h.cta.accent, body: '', ctaPrimaryLabel: h.cta.label, ctaPrimaryHref: h.cta.href, ctaSecondaryLabel: '', ctaSecondaryHref: '' } },
      ],
    },
    {
      slug: m.slug, label: m.label, seo: { title: m.label, description: m.seoDescription },
      blocks: [hero({ eyebrow: m.eyebrow, title: m.title, accent: m.accent, lead: m.lead }), live(m.live)],
    },
    {
      slug: 'about', label: 'About', seo: { title: 'About', description: 'Who we are and how we do things.' },
      blocks: [
        { type: 'MediaText', props: { image: '', alt: '', eyebrow: 'Our story', title: 'Hi, we are glad you are here.', titleAccent: '', kicker: '', body: `{{story|${spec.aboutLead}}}`, side: 'right', imgAspect: 'landscape', ctaLabel: '', ctaHref: '' } },
        { type: 'SpaceContact', props: { heading: 'Say hello' } },
      ],
    },
  ]
}

export function defaultKit(niche: KitNiche): SiteKit {
  const spec = NICHE_SPECS[niche]
  return { id: `default-${niche}`, label: spec.label, description: spec.description, theme: 'DAWN', version: 1, niche, pages: pages(spec) }
}
