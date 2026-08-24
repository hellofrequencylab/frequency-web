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
// ⚠️ STATUS. LIVE CONSUMERS — ALL EIGHT seeker articles now run through this
// generator: `how-to-start-a-circle` (enrolled 2026-08-19),
// `how-to-build-community`, `loneliness`, `friendship-as-an-adult`,
// `calm-down-fast` and `how-to-be-more-social` (all enrolled 2026-08-20), and
// `tools-for-community-builders` and `what-is-frequency` (both enrolled
// 2026-08-24), each a spec beside this file run through the recipe below. Lift
// 5d's article set is CLOSED: no coded seeker article is left, so the next change
// here is a change to the grammar itself rather than another enrolment.
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
//
// The SECOND enrolment (how-to-build-community, 2026-08-20) widened four of those seams,
// for the same reason and under the same rule — optional, copy-carrying, already-shipped
// blocks, and an article using none of them renders byte-identically to before:
//   · media beats gained `kicker`      — the coded ZigZags carry kicker lines; the
//                                        MediaText block always had the prop.
//   · `image` became optional          — that article's coded hero is a plain PageHero;
//                                        no photo means the Hero's `minimal` variant,
//                                        not a photo the page never had.
//   · sections gained their own `howTo`— the pillar article carries THREE ordered
//                                        tracks, one per section; each DawnHowToSteps
//                                        block emits its own HowTo node, so three
//                                        tracks ship three nodes, exactly as coded.
//   · sections gained `beats`          — a section that closes with a photo beat AND a
//                                        pull quote needs two; `beat` remains the
//                                        one-beat shorthand (`beats` wins if both).
//
// The THIRD enrolment (loneliness, 2026-08-20) widened one more seam, same rule:
//   · media beats gained `links`       — the coded closing ZigZag carried TWO buttons
//                                        inside its text column (a Button row, not the
//                                        single `cta` slot); they become a `Buttons`
//                                        block closing the beat's band, so neither
//                                        label nor link is dropped. Unused, nothing
//                                        renders and existing documents are unchanged.
//
// The SIXTH enrolment (how-to-be-more-social, 2026-08-20) widened one more, same rule:
//   · sections gained `note`           — a prose line closing the section AFTER its
//                                        button row (the coded page's "Keep going"
//                                        cross-link paragraph, three internal links
//                                        the pillar cluster needs). Folding it into
//                                        `body` would move it above the buttons, the
//                                        same silent reorder `closingBeat` exists to
//                                        prevent. Unused, nothing renders and existing
//                                        documents are unchanged.
//
// The FOURTH enrolment (friendship-as-an-adult, 2026-08-20) widened two more, same rule:
//   · sections gained `steps`          — plain ordered steps WITHOUT a HowTo node
//                                        (`BuildTimeline`, which emits no schema). The
//                                        coded hub shows THREE step lists but asserts
//                                        only ONE HowTo; routing the other two through
//                                        DawnHowToSteps would invent schema claims and
//                                        the visible name/intro copy the block requires.
//                                        `howTo` remains the form for steps that ARE a
//                                        guide; `steps` is for steps that are only copy.
//   · the spec gained `closingBeat`    — one beat between the FAQ and the close, where
//                                        the coded page's final Statement (the brand
//                                        line) sits. Without it that sentence would be
//                                        dropped or moved above the FAQ.
//
// The SEVENTH enrolment (tools-for-community-builders, 2026-08-24) widened NOTHING, and
// that is the first evidence the seams have converged: an article written for a DIFFERENT
// reader (the Latent Leader assembling a stack, CONTENT-VOICE §2b, not the Seeker) fit the
// existing fields exactly. It is also the second article to assert NO HowTo, using neither
// `howTo` nor `steps`, because it carries no ordered guide to assert one from.
//
// The EIGHTH enrolment (what-is-frequency, 2026-08-24) widened three, under the same rule —
// optional, copy-carrying, blocks that already ship in a live template, and an article using
// none of them renders BYTE-IDENTICALLY to before. That last clause was measured, not
// asserted: all six prior specs were rendered through the pre-change and post-change
// generator and the JSON diffed, and nothing moved.
//   · sections gained `tiers`          — the PRICE LADDER the coded page lifts so an answer
//                                        engine can quote the whole shape in one place. Each
//                                        row is four fields (name, price, who it is for, the
//                                        network-only rate): `links` would drop three of them
//                                        and folding it into `body` would need punctuation the
//                                        copy never had. The `Tiers` block (live in
//                                        templates/pricing.ts) carries all four and emits NO
//                                        schema of its own, so no Product/Offer node is
//                                        invented on a page that never made that claim.
//   · sections gained `cards`          — a row of LINK CARDS: a title, a sentence, an internal
//                                        href. The hub-and-spoke cross-links CONTENT-VOICE §8b
//                                        asks for. Flattening them into `links` would keep the
//                                        labels and silently drop the sentences. `FeatureGrid`
//                                        (live in three templates) carries both, and also emits
//                                        no schema.
//   · sections gained `afterSteps`     — a paragraph closing the section BELOW its ordered
//                                        steps. `body` renders above them, and `note` renders
//                                        above them too (it closes the BUTTON row), so neither
//                                        can hold a line the coded page printed under the
//                                        steps. Exactly the silent reorder `note` and
//                                        `closingBeat` exist to prevent, one position further
//                                        down the section.
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
      /** The italic kicker line under the title, when the coded ZigZag carried one. */
      kicker?: string
      /** Paragraphs, separated by a blank line. `[label](/path)` links work. */
      body: string
      /** Which side the photo sits on, so consecutive beats alternate. */
      side?: 'left' | 'right'
      ctaLabel?: string
      ctaHref?: string
      /** A button ROW closing the beat's band, when the coded ZigZag carried more
       *  buttons than the single `cta` slot holds. Rendered as a `Buttons` block in
       *  the SAME tone directly under the MediaText, so no label or link is dropped. */
      links?: ArticleLink[]
    }

/** An in-section button row. Internal links inside the pillar cluster, kept as
 *  buttons rather than flattened into prose. */
export type ArticleLink = {
  label: string
  href: string
  variant?: 'primary' | 'secondary' | 'ghost'
}

/** One row of a price ladder an article LIFTS for answer engines. Four fields, because
 *  the coded ladder prints four: dropping any of them is the silent-loss shape. Rendered
 *  as a `Tiers` block, which emits NO schema — a page that never claimed Product/Offer
 *  must not start claiming it because the ladder changed renderer. */
export type ArticleTier = {
  name: string
  /** The figure, exactly as the page prints it (cadence included, e.g. `$29/mo`). */
  price: string
  /** Who the tier is for, in a sentence. */
  who: string
  /** The small line under the price (the coded ladder's network-only rate). */
  note?: string
}

/** A link card: a title, a sentence, and an internal href. The hub-and-spoke cross-links
 *  CONTENT-VOICE §8b asks for, kept as cards rather than flattened into a button row,
 *  which would keep the labels and drop the sentences. Rendered as a `FeatureGrid`,
 *  which emits no schema. */
export type ArticleCard = {
  title: string
  body: string
  href: string
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
  /** A prose line closing the section AFTER its button row — the coded pages'
   *  "Keep going" cross-link paragraph. `[label](/path)` links work. Folding it
   *  into `body` would move it above the buttons; this keeps the coded order. */
  note?: string
  /** Plain ordered steps that are NOT a guide: rendered as numbered cards
   *  (`BuildTimeline`) with NO HowTo node. For the coded `Steps` lists an article
   *  shows without asserting a HowTo — running them through `howTo` instead would
   *  add schema claims the coded page never made, and would demand a visible
   *  name/intro the coded page never wrote. */
  steps?: { name: string; text: string }[]
  /** This section's OWN ordered guide, when the article carries more than one track
   *  (a pillar article can). Rendered after the section's copy, before its beats.
   *  Each DawnHowToSteps block emits its own HowTo node, so several tracks ship
   *  several nodes — dropping the extras would be the silent-loss shape again. */
  howTo?: ArticleHowTo
  /** The price ladder this section lifts, when it has one. Sits directly under the
   *  section's answer and ABOVE its button row, exactly where the coded list sat. */
  tiers?: ArticleTier[]
  /** A row of link cards under the section's answer. */
  cards?: ArticleCard[]
  /** A paragraph closing the section BELOW its ordered steps. `body` renders above the
   *  steps and `note` closes the BUTTON row above them, so neither can carry a line the
   *  coded page printed under the steps. Same silent reorder `note` exists to prevent,
   *  one position further down. `[label](/path)` links work. */
  afterSteps?: string
  /** Optional beat that CLOSES this section's band group. */
  beat?: ArticleBeat
  /** Several closing beats (e.g. a photo beat then a pull quote), in order. The
   *  plural form of `beat`: write one or the other, and `beats` wins if both. */
  beats?: ArticleBeat[]
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
  /** The hero photo. Optional because an article whose coded hero was a plain
   *  PageHero has no photo to recover: leaving this out renders the Hero's
   *  `minimal` variant instead of inventing an image the page never shipped. */
  image?: string
  /** The hero photo's alt text. Recorded here with the copy it belongs to; the `Hero`
   *  block has no alt field today, so it is not yet rendered. */
  alt?: string
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
  /** Optional beat between the FAQ and the close, for an article whose coded page
   *  ends on a statement (the brand line) after the questions. */
  closingBeat?: ArticleBeat
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

  const pushBeat = (beat: ArticleBeat, key: string, toneOverride?: 'surface' | 'canvas') => {
    const tone = toneOverride ?? nextTone()
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
        kicker: beat.kicker ?? '',
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
    if (beat.links && beat.links.length > 0) {
      // The beat's button row, in the SAME tone (not nextTone()): the coded buttons sat
      // INSIDE the ZigZag's band, so the row closes that band rather than opening one.
      content.push({
        type: 'Buttons',
        props: {
          id: id(`${key}-links`),
          items: beat.links.map((l) => ({
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
  }

  content.push({
    type: 'Hero',
    props: {
      id: id('hero'),
      // No photo in the spec means the coded hero had none: render the plain
      // (minimal) variant rather than the image variant's fallback photo.
      variant: spec.image ? 'image' : 'minimal',
      eyebrow: spec.eyebrow,
      title: spec.title,
      titleAccent: '',
      subtitle: spec.subtitle,
      image: spec.image ?? '',
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

  // An ordered how-to. This block owns the HowTo node, so the steps and the
  // structured data are the same array — one call per track, article-level or
  // section-level, and each block emits its own node.
  const pushHowTo = (howTo: ArticleHowTo, key: string) => {
    content.push({
      type: 'DawnHowToSteps',
      props: {
        id: id(key),
        eyebrow: 'How to',
        name: howTo.name,
        nameAccent: '',
        kicker: '',
        intro: howTo.intro,
        totalTimeLabel: howTo.totalTimeLabel ?? '',
        totalTime: howTo.totalTime ?? '',
        steps: howTo.steps.map((s) => ({
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
    if (section.tiers && section.tiers.length > 0) {
      // The ladder sits INSIDE the section's band (the section's own `tone`, not
      // nextTone()): the coded list was one `<ul>` inside the section, so it closes the
      // answer rather than opening a moment of its own. The block emits no schema.
      content.push({
        type: 'Tiers',
        props: {
          id: id(`tiers${i + 1}`),
          eyebrow: '',
          title: '',
          titleAccent: '',
          kicker: '',
          items: section.tiers.map((t) => ({
            name: t.name,
            livePriceKey: '',
            price: t.price,
            strikePrice: '',
            cadence: '',
            priceNote: t.note ?? '',
            tagline: t.who,
            highlight: 'normal',
            badge: 'none',
            features: [],
            ctaLabel: '',
            ctaHref: '',
            ctaStyle: 'secondary',
          })),
          footnote: '',
          emphasis: EMPHASIS,
          tone,
          width: 'default',
          align: 'left',
          layout: { ...L, spaceTop: 'none' },
        },
      })
    }
    if (section.cards && section.cards.length > 0) {
      // Same band, same reason. `style: 'icon'` with no icon named renders the card
      // without one, so no decoration is invented for a page that shipped none.
      content.push({
        type: 'FeatureGrid',
        props: {
          id: id(`cards${i + 1}`),
          eyebrow: '',
          title: '',
          titleAccent: '',
          style: 'icon',
          columns: '3',
          items: section.cards.map((c) => ({
            icon: '',
            image: '',
            title: c.title,
            body: c.body,
            href: c.href,
          })),
          emphasis: EMPHASIS,
          tone,
          width: 'default',
          align: 'left',
          layout: { ...L, spaceTop: 'none' },
        },
      })
    }
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
    if (section.note) {
      // The section's closing prose line, AFTER the buttons, exactly where the coded
      // "Keep going" paragraph sat. Body size, not Lead: it is a footnote, not an answer.
      content.push({
        type: 'Text',
        props: {
          id: id(`note${i + 1}`),
          body: section.note,
          size: 'base',
          tone,
          width: 'default',
          align: 'left',
          layout: { ...L, spaceTop: 'none' },
        },
      })
    }
    if (section.steps && section.steps.length > 0) {
      // Plain ordered steps, exactly where the coded `Steps` sat: after the section's
      // copy, before its guide and beats. `BuildTimeline` renders the same big-numeral
      // 01/02/03 cards and emits NO schema, which is the point: these lists are copy,
      // not a HowTo claim. Steps that ARE a guide belong in `howTo` instead.
      content.push({
        type: 'BuildTimeline',
        props: {
          id: id(`steps${i + 1}`),
          eyebrow: '',
          title: '',
          titleAccent: '',
          kicker: '',
          intro: '',
          items: section.steps.map((s) => ({
            label: '',
            title: s.name,
            tag: '',
            body: s.text,
            highlight: 'normal',
          })),
          footnote: '',
          texture: 'none',
          flow: 'beat',
          tone: nextTone(),
          layout: L,
        },
      })
    }
    if (spec.howTo && i + 1 === howToAfter) pushHowTo(spec.howTo, 'howto')
    if (section.howTo) pushHowTo(section.howTo, `howto-${i + 1}`)
    if (section.afterSteps) {
      // The section's closing paragraph, BELOW the steps, exactly where the coded page
      // printed it. Returns to the SECTION's tone rather than drawing a new one: it is
      // the section talking again, not a new moment.
      content.push({
        type: 'Text',
        props: {
          id: id(`after${i + 1}`),
          body: section.afterSteps,
          size: 'base',
          tone,
          width: 'default',
          align: 'left',
          layout: L,
        },
      })
    }
    const beats = section.beats ?? (section.beat ? [section.beat] : [])
    // The first beat keeps the `beat-<n>` key the first enrolment shipped, so its
    // block ids (and any operator draft keyed on them) do not move.
    beats.forEach((b, j) => pushBeat(b, j === 0 ? `beat-${i + 1}` : `beat-${i + 1}-${j + 1}`))
  })

  // A how-to placed past the last section (or on an article with no sections) still ships.
  if (spec.howTo && howToAfter > spec.sections.length) pushHowTo(spec.howTo, 'howto')

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

  // A beat after the questions, when the coded page closed on one (the brand line).
  // The tone is PINNED to canvas rather than drawn from the counter: the Accordion's
  // band is fixed at surface outside the alternation, so a counter-drawn surface here
  // would merge the beat into the FAQ's band instead of giving it its own moment
  // (canvas also always contrasts with the ink CallToAction below).
  if (spec.closingBeat) pushBeat(spec.closingBeat, 'beat-close', 'canvas')

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
