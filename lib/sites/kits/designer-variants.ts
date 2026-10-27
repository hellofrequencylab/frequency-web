import { NICHE_SPECS, type LiveBlock, type NicheSpec } from './niche-spec'
import type { KitNiche, KitPage, SiteKit } from './types'

// Designer x the six niche doors. One mega theme, six starting points, all DATA: pages of Designer blocks
// (components/page-editor/blocks/designer.tsx) plus the shared live Space blocks. The words come from
// niche-spec.ts (house voice, docs/marketing/voice-and-language-guide.md: plain, warm, no hard claims, no prices, no photos).
// Every Designer prop that would fall back to the theme's own words is set here. Wrap words in *stars* for the italic.

type Block = KitPage['blocks'][number]

const live = (kind: LiveBlock): Block => {
  switch (kind) {
    case 'offerings': return { type: 'SpaceOfferings', props: { eyebrow: 'Ways to work together', heading: 'Offerings' } }
    case 'events': return { type: 'SpaceEvents', props: {} }
    case 'community': return { type: 'SpaceCommunity', props: {} }
    case 'booking': return { type: 'SpaceBooking', props: { heading: '' } }
  }
}

const star = (title: string, accent: string) => (accent && title.includes(accent) ? title.replace(accent, `*${accent}*`) : title)

const hero = (size: 'full' | 'short', p: { eyebrow: string; title: string; accent: string; lead: string; primary?: { label: string; href: string }; secondary?: { label: string; href: string } }): Block => ({
  type: 'DesignerHero',
  props: {
    size, image: '', alt: '', eyebrow: p.eyebrow, title: star(p.title, p.accent), lead: p.lead,
    primaryLabel: p.primary?.label ?? '', primaryHref: p.primary?.href ?? '', secondaryLabel: p.secondary?.label ?? '', secondaryHref: p.secondary?.href ?? '',
    strip: [],
  },
})

function pages(spec: NicheSpec): KitPage[] {
  const h = spec.home
  const m = spec.main
  return [
    {
      slug: 'home', label: 'Home', seo: { title: h.seoTitle, description: h.seoDescription },
      blocks: [
        hero('full', { eyebrow: h.eyebrow, title: h.title, accent: h.accent, lead: h.lead, primary: h.primary, secondary: h.secondary }),
        { type: 'DesignerSteps', props: { image: '', alt: '', eyebrow: h.stepsEyebrow, title: h.stepsTitle, steps: h.steps.map((s) => ({ title: s.title, lead: '', body: s.body })) } },
        live(h.live),
        { type: 'DesignerFAQ', props: { title: h.faqTitle, contactLabel: 'Say hello', phone: '', email: '', buttonLabel: h.cta.label, buttonHref: h.cta.href, items: h.faqs } },
        { type: 'DesignerClosing', props: { title: star(h.cta.heading, h.cta.accent), buttonLabel: h.cta.label, buttonHref: h.cta.href, nextEyebrow: '', next: { image: '', title: '', location: '', year: '', href: '' } } },
      ],
    },
    {
      slug: m.slug, label: m.label, seo: { title: m.label, description: m.seoDescription },
      blocks: [hero('short', { eyebrow: m.eyebrow, title: m.title, accent: m.accent, lead: m.lead }), live(m.live)],
    },
    {
      slug: 'about', label: 'About', seo: { title: 'About', description: 'Who we are and how we do things.' },
      blocks: [
        { type: 'DesignerFounder', props: { eyebrow: 'Our story', title: 'Hi, we are *glad you are here.*', lead: '', paragraphs: `{{story|${spec.aboutLead}}}`, buttonLabel: '', buttonHref: '', image: '', alt: '', quote: '', quoteBy: '' } },
        { type: 'SpaceContact', props: { heading: 'Say hello' } },
      ],
    },
  ]
}

export function designerKit(niche: KitNiche): SiteKit {
  const spec = NICHE_SPECS[niche]
  return { id: `designer-${niche}`, label: spec.label, description: spec.description, theme: 'Designer', version: 1, niche, pages: pages(spec) }
}
