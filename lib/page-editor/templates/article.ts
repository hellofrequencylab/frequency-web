import type { Data, ContentItem } from '@/lib/page-editor/types'
import { BETA_CTA_LABEL, BETA_CTA_HREF } from '@/lib/site'

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE — the SHARED seed for the seeker articles (UX-MATURITY-PLAN Lift 5d,
// ADR-1068). One generator, one spec per article, instead of eight hand-built
// template files that drift from each other the way the coded pages did.
//
// WHY A GENERATOR AND NOT EIGHT FILES. The six marketing primaries each got their
// own `templates/<slug>.ts` because each is a different PAGE. The eight seeker
// articles are eight instances of ONE page: the article grammar in
// docs/CONTENT-VOICE.md §10.9 — question H2s, the direct answer first, one concept
// per section, an FAQ, and schema. Writing that grammar eight times is how the
// answer-first opening quietly goes missing on article six. Here the grammar is
// the SHAPE OF THE SPEC: an article without an answer-first opening or without an
// FAQ cannot be expressed, because `answer` and `faq` are required fields.
//
// WHO EMITS WHICH SCHEMA. A coded article emits four nodes by hand. Composed from
// blocks the same four still ship, and none of them from the route's body:
//   · FAQPage  — the `Accordion` block renders its own <JsonLd> (block-seo.tsx).
//   · HowTo    — the `DawnHowToSteps` block owns it, dropping the node rather than
//                emitting an invalid one (components/page-editor/blocks/dawn.tsx).
//   · Article  — page-level, from <BlockDocJsonLd data={data} path={PATH} /> in the
//                route, because only the route knows its canonical URL.
//   · Breadcrumb — page-level, the route's existing <JsonLd data={breadcrumbSchema}>.
// So an enrolled article keeps all four; the route keeps the last two.
//
// ⚠️ STATUS. This generator has NO live consumer yet, and that is deliberate:
// `check:render-path` gates one slug per PR, and enrolling an article is a route
// change per article. `article.test.ts` is what holds it honest in the meantime —
// it renders a spec through the CURRENT block config, so a block rename breaks this
// file loudly instead of on the day someone first enrolls an article.
//
// TO ENROLL ONE ARTICLE (the whole recipe, per PR):
//   1. Write its spec beside its route and call `articleTemplate(spec)`.
//   2. Register it in `templates/index.ts` so `getTemplate(slug)` resolves.
//   3. Add the slug to `EDITABLE_PAGES` (lib/page-editor/data.ts).
//   4. Add its route to `ROUTES` in scripts/check-render-path.mjs and a row to
//      scripts/render-path-bodies.txt.
//   5. Thin the route to metadata + <BlockDocJsonLd> + <BlockRender>, exactly as
//      app/(marketing)/about/page.tsx now reads.
//
// COPY CONTRACT (docs/NAMING.md wins on names; docs/CONTENT-VOICE.md on voice):
// every string here comes from the SPEC. The only literals this file owns are the
// two structural labels the existing articles already use ("Common questions") and
// the shared beta CTA, so the generator can never put words in an article's mouth.
// No em dashes. Sentence case. Canon terms verbatim.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const
const EMPHASIS = { scale: 'default', accent: 'none' } as const

/** One question-led section: the reader's question as the H2, answered in its first
 *  sentence. `answer` is the direct answer (set large); `body` is the elaboration. */
export type ArticleSection = {
  /** The H2, phrased as the reader would search it (CONTENT-VOICE §10.9). */
  question: string
  /** The direct answer, first. Rendered at Lead size. */
  answer: string
  /** Optional elaboration below the answer. */
  body?: string
}

/** The ordered how-to, when the article has one. Feeds BOTH the visible steps and
 *  the HowTo node, from one place, so the two can never drift. */
export type ArticleHowTo = {
  /** The guide name. Also the HowTo `name`. */
  name: string
  /** Intro paragraph. Also the HowTo `description`. */
  intro: string
  /** ISO 8601 duration (e.g. `PT30M`). Anything else is dropped by the block. */
  totalTime?: string
  /** How long it takes, in words, for the reader. */
  totalTimeLabel?: string
  steps: { name: string; text: string; image?: string; alt?: string }[]
}

export type ArticleSpec = {
  /** The article's slug. Only used to key block ids, so they stay stable per page. */
  slug: string
  eyebrow: string
  title: string
  /** The standfirst under the title. */
  subtitle: string
  image: string
  alt: string
  /** The opening CTA, into the product. */
  heroCtaLabel?: string
  heroCtaHref?: string
  /** ANSWER-FIRST: the question the whole page answers, resolved in one or two
   *  sentences, before anything else. Required by shape, not by convention. */
  answer: string
  /** Optional second paragraph of the opening. */
  intro?: string
  sections: ArticleSection[]
  howTo?: ArticleHowTo
  /** Required: an article without an FAQ ships no FAQPage node, and these pages are
   *  the highest-intent answer-engine surface on the site (CONTENT-VOICE §8). */
  faq: { q: string; a: string }[]
  close: { heading: string; body: string; ctaLabel?: string; ctaHref?: string }
}

/** Bands alternate so consecutive sections read as separate beats rather than one
 *  long scroll. Index-driven, so adding a section never needs a tone decision. */
const bandTone = (i: number) => (i % 2 === 0 ? 'surface' : 'canvas')

/** The seeker-article document for one spec, composed only from registered blocks. */
export function articleTemplate(spec: ArticleSpec): Data {
  const id = (suffix: string) => `${spec.slug}-${suffix}`
  const content: ContentItem[] = []

  content.push({
    type: 'Hero',
    props: {
      id: id('hero'),
      variant: 'image',
      eyebrow: spec.eyebrow,
      title: spec.title,
      titleAccent: '',
      subtitle: spec.subtitle,
      image: spec.image,
      focal: 'center',
      minHeight: 'auto',
      facts: [],
      ctaPrimaryLabel: spec.heroCtaLabel ?? '',
      ctaPrimaryHref: spec.heroCtaHref ?? '',
      ctaSecondaryLabel: '',
      ctaSecondaryHref: '',
      note: '',
      tone: 'surface',
      width: 'default',
      align: 'center',
      layout: L,
    },
  })

  // The answer, first. `size: 'lg'` is the Lead the coded articles open with.
  content.push({
    type: 'Text',
    props: {
      id: id('answer'),
      body: spec.intro ? `${spec.answer}\n\n${spec.intro}` : spec.answer,
      size: 'lg',
      tone: 'canvas',
      width: 'default',
      align: 'left',
      layout: L,
    },
  })

  // One concept per section: the question as the H2, then the answer at Lead size
  // with the elaboration under it.
  spec.sections.forEach((section, i) => {
    const tone = bandTone(i)
    content.push({
      type: 'Heading',
      props: {
        id: id(`q${i + 1}`),
        eyebrow: '',
        title: section.question,
        titleAccent: '',
        kicker: '',
        emphasis: EMPHASIS,
        tone,
        width: 'default',
        align: 'left',
        layout: { ...L, spaceBottom: 'none' },
      },
    })
    content.push({
      type: 'Text',
      props: {
        id: id(`a${i + 1}`),
        body: section.body ? `${section.answer}\n\n${section.body}` : section.answer,
        size: 'lg',
        tone,
        width: 'default',
        align: 'left',
        layout: { ...L, spaceTop: 'none' },
      },
    })
  })

  // The ordered how-to. This block owns the HowTo node, so the steps and the
  // structured data are the same array.
  if (spec.howTo) {
    content.push({
      type: 'DawnHowToSteps',
      props: {
        id: id('howto'),
        eyebrow: 'How to',
        name: spec.howTo.name,
        nameAccent: '',
        kicker: '',
        intro: spec.howTo.intro,
        totalTimeLabel: spec.howTo.totalTimeLabel ?? '',
        totalTime: spec.howTo.totalTime ?? '',
        steps: spec.howTo.steps.map((s) => ({
          name: s.name,
          text: s.text,
          image: s.image ?? '',
          alt: s.alt ?? '',
        })),
        tone: bandTone(spec.sections.length),
        layout: L,
      },
    })
  }

  // The FAQ. This block owns the FAQPage node.
  content.push({
    type: 'Accordion',
    props: {
      id: id('faq'),
      eyebrow: '',
      title: 'Common questions',
      titleAccent: '',
      items: spec.faq.map((f) => ({ q: f.q, a: f.a })),
      emphasis: EMPHASIS,
      tone: 'surface',
      width: 'default',
      align: 'left',
      layout: L,
    },
  })

  content.push({
    type: 'CallToAction',
    props: {
      id: id('cta'),
      eyebrow: '',
      heading: spec.close.heading,
      headingAccent: '',
      body: spec.close.body,
      ctaPrimaryLabel: spec.close.ctaLabel ?? BETA_CTA_LABEL,
      ctaPrimaryHref: spec.close.ctaHref ?? BETA_CTA_HREF,
      ctaSecondaryLabel: '',
      ctaSecondaryHref: '',
      emphasis: EMPHASIS,
      tone: 'ink',
      width: 'default',
      align: 'center',
      layout: L,
    },
  })

  return { root: {}, content }
}
