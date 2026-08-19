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
// ⚠️ STATUS. FIRST LIVE CONSUMER 2026-08-19: `how-to-start-a-circle` (templates/
// how-to-start-a-circle.ts), enrolled by the recipe below. The other seven articles
// are still coded pages; `check:render-path` gates one slug per PR and enrolling an
// article is a route change per article, so they enroll one at a time.
// `article.test.ts` remains the guard that keeps this generator honest independently
// of any one article — it renders a spec through the CURRENT block config, so a block
// rename breaks this file loudly rather than on the day someone enrolls the next one.
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
//
// WHAT THE OPTIONAL FIELDS ARE FOR (added 2026-08-19 by the first enrolment). A coded
// seeker article is not only question sections: it also carries pull quotes, statement
// bands, photo-and-text beats, and in-section buttons, and every one of those is COPY
// or an internal link, not decoration. Converting an article by dropping them would
// lose words and lose the pillar-cluster internal linking CONTENT-VOICE §8b asks for,
// which is the same class of silent loss as dropping a schema node. So the grammar
// stayed required and the trimmings became OPTIONAL spec fields, each mapped to a
// block that already ships in a live template:
//   · `beat`         → `Statement` / `MediaText`  (closes a section's band group)
//   · `links`        → `Buttons`                  (sits inside the section's band)
//   · `openingBeat`  → the same, right after the answer
//   · `howToAfter`   → where the ordered steps sit, when they are not last
// An article that needs none of them writes none of them, and reads exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const
const EMPHASIS = { scale: 'default', accent: 'none' } as const

/** An editorial beat between question sections. Both variants are pure copy carriers:
 *  they exist so converting a coded article does not silently delete sentences. */
export type ArticleBeat =
  | {
      kind: 'statement'
      /** The line, in full. */
      text: string
      /** A substring of `text` to lift in the brand accent (fields.tsx `accentize`). */
      accent?: string
    }
  | {
      kind: 'media'
      /** A real-gathering photo: the multimodal AIO signal and the E-E-A-T proof
       *  (CONTENT-VOICE §8b, §8e). */
      image: string
      alt: string
      eyebrow?: string
      title: string
      titleAccent?: string
      /** Paragraphs, separated by a blank line. `[label](/path)` links work. */
      body: string
      /** Which side the photo sits on, so consecutive beats alternate. */
      side?: 'left' | 'right'
      ctaLabel?: string
      ctaHref?: string
    }

/** An in-section button row. Internal links inside the pillar cluster, kept as
 *  buttons rather than flattened into prose. */
export type ArticleLink = {
  label: string
  href: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

/** One question-led section: the reader's question as the H2, answered in its first
 *  sentence. `answer` is the direct answer (set large); `body` is the elaboration. */
export type ArticleSection = {
  /** The H2, phrased as the reader would search it (CONTENT-VOICE §10.9). */
  question: string
  /** The direct answer, first. Rendered at Lead size. */
  answer: string
  /** Optional elaboration below the answer. */
  body?: string
  /** Optional buttons, inside this section's band. */
  links?: ArticleLink[]
  /** Optional beat that CLOSES this section's band group. */
  beat?: ArticleBeat
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
  /** The hero photo's alt text. Recorded here with the copy it belongs to; the `Hero`
   *  block has no alt field today, so it is not yet rendered. */
  alt: string
  /** The opening CTA, into the product. */
  heroCtaLabel?: string
  heroCtaHref?: string
  /** ANSWER-FIRST: the question the whole page answers, resolved in one or two
   *  sentences, before anything else. Required by shape, not by convention. */
  answer: string
  /** Optional second paragraph of the opening. */
  intro?: string
  /** Optional beat directly under the opening answer. */
  openingBeat?: ArticleBeat
  sections: ArticleSection[]
  howTo?: ArticleHowTo
  /** Where the ordered steps sit: after this many sections. Defaults to last, which is
   *  where an article whose steps ARE the finale wants them. */
  howToAfter?: number
  /** Required: an article without an FAQ ships no FAQPage node, and these pages are
   *  the highest-intent answer-engine surface on the site (CONTENT-VOICE §8). */
  faq: { q: string; a: string }[]
  close: { heading: string; body: string; ctaLabel?: string; ctaHref?: string }
}

/** The seeker-article document for one spec, composed only from registered blocks. */
export function articleTemplate(spec: ArticleSpec): Data {
  const id = (suffix: string) => `${spec.slug}-${suffix}`
  const content: ContentItem[] = []

  // Bands alternate so consecutive beats read as separate moments rather than one long
  // scroll. Driven by a running counter rather than a section index, so an optional beat
  // slotted between two sections never puts two identical bands back to back, and adding
  // one never needs a tone decision.
  let band = 0
  const nextTone = () => (band++ % 2 === 0 ? 'surface' : 'canvas')

  const pushBeat = (beat: ArticleBeat, key: string) => {
    const tone = nextTone()
    if (beat.kind === 'statement') {
      content.push({
        type: 'Statement',
        props: { id: id(key), text: beat.text, accent: beat.accent ?? '', tone, layout: L },
      })
      return
    }
    content.push({
      type: 'MediaText',
      props: {
        id: id(key),
        image: beat.image,
        alt: beat.alt,
        eyebrow: beat.eyebrow ?? '',
        title: beat.title,
        titleAccent: beat.titleAccent ?? '',
        kicker: '',
        body: beat.body,
        side: beat.side ?? 'left',
        imgAspect: 'landscape',
        focal: 'center',
        ctaLabel: beat.ctaLabel ?? '',
        ctaHref: beat.ctaHref ?? '',
        tone,
        width: 'default',
        align: 'left',
        layout: L,
      },
    })
  }

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

  if (spec.openingBeat) pushBeat(spec.openingBeat, 'beat-0')

  // The ordered how-to. This block owns the HowTo node, so the steps and the
  // structured data are the same array.
  const pushHowTo = () => {
    if (!spec.howTo) return
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
        tone: nextTone(),
        layout: L,
      },
    })
  }

  // Where the steps sit. Default: after every section.
  const howToAfter = spec.howToAfter ?? spec.sections.length

  // One concept per section: the question as the H2, then the answer at Lead size
  // with the elaboration under it. The section's own buttons sit inside its band; the
  // steps (when this is their section) and then the beat close the group.
  spec.sections.forEach((section, i) => {
    const tone = nextTone()
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
    const links = section.links ?? []
    content.push({
      type: 'Text',
      props: {
        id: id(`a${i + 1}`),
        body: section.body ? `${section.answer}\n\n${section.body}` : section.answer,
        size: 'lg',
        tone,
        width: 'default',
        align: 'left',
        layout: { ...L, spaceTop: 'none', ...(links.length > 0 ? { spaceBottom: 'none' } : {}) },
      },
    })
    if (links.length > 0) {
      content.push({
        type: 'Buttons',
        props: {
          id: id(`links${i + 1}`),
          items: links.map((l) => ({
            label: l.label,
            href: l.href,
            variant: l.variant ?? 'secondary',
          })),
          align: 'left',
          tone,
          layout: { ...L, spaceTop: 'none' },
        },
      })
    }
    if (i + 1 === howToAfter) pushHowTo()
    if (section.beat) pushBeat(section.beat, `beat-${i + 1}`)
  })

  // A how-to placed past the last section (or on an article with no sections) still ships.
  if (howToAfter > spec.sections.length) pushHowTo()

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
