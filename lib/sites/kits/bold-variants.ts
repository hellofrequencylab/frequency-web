import { NICHE_SPECS, type LiveBlock, type NicheSpec } from './niche-spec'
import type { KitNiche, KitPage, SiteKit } from './types'

// Bold x the six niche doors. All DATA, in the Bold theme's own block vocabulary
// (PhotoHero, CardGrid, EditorialSection, CallToAction) with the shared live Space blocks. Words come from niche-spec.ts.

type Block = KitPage['blocks'][number]

const live = (kind: LiveBlock, heading = ''): Block => {
  switch (kind) {
    case 'offerings': return { type: 'SpaceOfferings', props: { eyebrow: 'Ways to work together', heading: heading || 'Offerings' } }
    case 'events': return { type: 'SpaceEvents', props: {} }
    case 'community': return { type: 'SpaceCommunity', props: {} }
    case 'booking': return { type: 'SpaceBooking', props: { heading: '' } }
  }
}

const hero = (p: { eyebrow: string; title: string; accent: string; lead: string; primary?: { label: string; href: string }; secondary?: { label: string; href: string } }): Block => ({
  type: 'PhotoHero',
  props: {
    variant: 'text-only', image: '', alt: '', eyebrow: p.eyebrow, title: p.title, accentWord: p.accent, subtitle: p.lead, height: 'medium', display: 'below', note: '',
    actionPrimaryLabel: p.primary?.label ?? '', actionPrimaryHref: p.primary?.href ?? '', actionSecondaryLabel: p.secondary?.label ?? '', actionSecondaryHref: p.secondary?.href ?? '',
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
        { type: 'CardGrid', props: { role: 'step', columns: 3, eyebrow: h.stepsEyebrow, title: h.stepsTitle, accentWord: '', cards: h.steps.map((st) => ({ icon: '', image: '', alt: '', title: st.title, body: st.body, by: '', href: '' })) } },
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
        { type: 'EditorialSection', props: { body: 'prose', surface: 'open', eyebrow: 'Our story', title: 'Hi, we are glad you are here.', accentWord: '', kicker: '', lead: `{{story|${spec.aboutLead}}}` } },
        { type: 'SpaceContact', props: { heading: 'Say hello' } },
      ],
    },
  ]
}

export function boldKit(niche: KitNiche): SiteKit {
  const spec = NICHE_SPECS[niche]
  return { id: `bold-${niche}`, label: spec.label, description: spec.description, theme: 'Menswork', version: 1, niche, pages: pages(spec) }
}
