// Article block library: the seeker-article layouts (lib/page-editor/templates/article.ts).
//
// The four seeker articles share ONE grammar (question H2s, the direct answer first, an FAQ) but not
// one subject, so they should not share one skeleton. These blocks carry the same copy the plain
// Heading + Text + Statement + MediaText blocks did, in four layouts an article picks with its spec's
// `design`:
//   · ArticleQuestion — one question section (the H2, its answer, its body, its buttons). Variants:
//                       quiet (a centred column, signal-line divider), talk (the question asked, the
//                       answer replied), path (a numbered node on a dotted path), panel (a sticky side
//                       heading beside a checklist panel). With no question it is the article's lede.
//   · ArticleLine     — one display sentence. Variants: quiet (serif, a breathing orb), photo (a pull
//                       line over a photograph), bubble (said, in a glass bubble), signpost (a marker on
//                       the path).
//   · ArticleStory    — a photo-and-text beat. Variants: chapter (a full-bleed photo chapter with a glass
//                       panel), overlap (overlapping photo cards), bento (a tips bento), pinned (a photo
//                       beside checklist panels).
//   · ArticleSteps    — ordered steps. Variants: trail, stack, path, timeline. With `schema: 'howto'` it
//                       OWNS the HowTo node exactly as DawnHowToSteps does (same builder, same <JsonLd>,
//                       same fail-closed rule); with `none` it is copy only, like BuildTimeline.
//
// Layout is Tailwind (so the editor canvas and any theme get a sane structure); the Frequency look
// (grain, glass, aura, iridescent rim, dotted connectors, signal lines) is the scope in
// app/themes/frequency/site-blocks.css §7, keyed on the `art-*` classes. Photos go through next/image
// with a `sizes` that matches the slot. No client JS.

import Image from 'next/image'
import { Check } from 'lucide-react'
import { JsonLd } from '@/components/json-ld'
import { richParagraphs } from '@/lib/page-editor/richtext'
import { focalField, focalClass } from '@/lib/page-editor/image-controls'
import { imgField } from '@/lib/page-editor/fields'
import { howToStepsSchema } from './dawn'
import {
  CtaButton,
  Eyebrow,
  accentize,
  toneBg,
  toneField,
  layoutField,
  layoutDefault,
  padClass,
  visClass,
  type LayoutValue,
  type ComponentConfig,
  type CtaVariant,
} from './kit'

type LinkItem = { label: string; href: string; variant?: CtaVariant }
type StepItem = { name?: string; text?: string; image?: string; alt?: string }

const linksField = {
  type: 'array' as const,
  label: 'Buttons (optional)',
  arrayFields: {
    label: { type: 'text' as const, label: 'Label' },
    href: { type: 'text' as const, label: 'Link' },
    variant: {
      type: 'select' as const,
      label: 'Style',
      options: [
        { label: 'Primary', value: 'primary' },
        { label: 'Secondary', value: 'secondary' },
        { label: 'Ghost', value: 'ghost' },
      ],
    },
  },
  getItemSummary: (item: LinkItem) => item.label || 'Button',
}

function variantField(label: string, options: [string, string][]) {
  return {
    type: 'select' as const,
    label,
    options: options.map(([value, l]) => ({ label: l, value })),
  }
}

function Links({ items }: { items?: LinkItem[] }) {
  const shown = (items ?? []).filter((l) => l.label && l.href)
  if (shown.length === 0) return null
  return (
    <div className="art-links mt-8 flex flex-wrap gap-3">
      {shown.map((l, i) => (
        <CtaButton key={i} href={l.href} label={l.label} variant={l.variant ?? 'secondary'} />
      ))}
    </div>
  )
}

/** A cropped photo in a sized slot, through the optimizer. */
function Photo({
  src,
  alt,
  sizes,
  focal,
  className = '',
  grain = true,
}: {
  src: string
  alt: string
  sizes: string
  focal?: string
  className?: string
  grain?: boolean
}) {
  return (
    <div className={`art-photo overflow-hidden ${/(^|\s)absolute(\s|$)/.test(className) ? '' : 'relative'} ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} className={`object-cover ${focalClass(focal)}`} />
      {grain && <span className="fq-grain art-grain" aria-hidden="true" />}
    </div>
  )
}

function sectionClass(kind: string, variant: string, tone?: string, layout?: LayoutValue, pad = 'py-16 sm:py-24') {
  return `art ${kind} ${kind}-${variant} relative px-4 sm:px-6 ${padClass(layout) ?? pad} ${toneBg(tone)} ${visClass(layout)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// ArticleQuestion
// ─────────────────────────────────────────────────────────────────────────────

export type QuestionVariant = 'quiet' | 'talk' | 'path' | 'panel'

export function ArticleQuestionBlock({
  variant = 'quiet',
  number,
  question,
  answer,
  body,
  links,
  note,
  tone,
  layout,
}: {
  variant?: QuestionVariant
  number?: string
  question?: string
  answer?: string
  body?: string
  links?: LinkItem[]
  note?: string
  tone?: string
  layout?: LayoutValue
}) {
  const lede = !question
  const heading = question ? (
    <h2 className="art-question font-display text-text text-balance text-[clamp(28px,4vw,52px)] leading-[1.04]">
      {question}
    </h2>
  ) : null
  const answerEl = answer ? (
    <div className={`art-answer text-lead text-text/85 leading-relaxed space-y-4 ${lede ? 'art-lede' : ''}`}>
      {richParagraphs(answer)}
    </div>
  ) : null
  const bodyEl = body ? (
    <div className="art-body mt-6 text-body-lg text-muted leading-relaxed space-y-4">{richParagraphs(body)}</div>
  ) : null
  const noteEl = note ? (
    <div className="art-note mt-6 text-body text-muted leading-relaxed space-y-3">{richParagraphs(note)}</div>
  ) : null
  const cls = sectionClass('art-q', variant, tone, layout, lede ? 'py-14 sm:py-20' : undefined)

  if (variant === 'talk') {
    return (
      <section className={cls} data-art="question">
        <div className="mx-auto max-w-5xl">
          {heading && <div className="art-ask relative max-w-2xl">{heading}</div>}
          {answerEl && <div className={`art-reply relative ${heading ? 'mt-6 sm:ml-auto' : ''} max-w-2xl`}>{answerEl}</div>}
          {(bodyEl || links?.length || noteEl) && (
            <div className="art-talk-body mx-auto max-w-3xl">
              {bodyEl}
              <Links items={links} />
              {noteEl}
            </div>
          )}
        </div>
      </section>
    )
  }

  if (variant === 'path') {
    return (
      <section className={cls} data-art="question">
        <div className="mx-auto grid max-w-5xl grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-10">
          <div className="art-rail relative flex justify-center" aria-hidden="true">
            <span className="art-node font-display">{number || ''}</span>
          </div>
          <div className="min-w-0 pb-2">
            {heading}
            {answerEl && <div className={heading ? 'mt-5' : ''}>{answerEl}</div>}
            {bodyEl}
            <Links items={links} />
            {noteEl}
          </div>
        </div>
      </section>
    )
  }

  if (variant === 'panel') {
    if (lede) {
      return (
        <section className={cls} data-art="question">
          <div className="art-panel mx-auto max-w-4xl rounded-card border border-border bg-surface p-6 sm:p-10">
            {answerEl}
            {bodyEl}
          </div>
        </section>
      )
    }
    return (
      <section className={cls} data-art="question">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="art-side lg:sticky lg:top-28 lg:self-start">
            {number && <p className="art-num font-display" aria-hidden="true">{number}</p>}
            {heading}
          </div>
          <div className="art-panel relative rounded-card border border-border bg-surface p-6 sm:p-10">
            <span className="art-check" aria-hidden="true">
              <Check className="h-5 w-5" />
            </span>
            {answerEl}
            {bodyEl}
            <Links items={links} />
            {noteEl}
          </div>
        </div>
      </section>
    )
  }

  // quiet
  return (
    <section className={cls} data-art="question">
      <div className={`mx-auto ${lede ? 'max-w-3xl' : 'max-w-2xl'}`}>
        {heading && <span className="art-signal" aria-hidden="true" />}
        {heading}
        {answerEl && <div className={heading ? 'mt-6' : ''}>{answerEl}</div>}
        {bodyEl}
        <Links items={links} />
        {noteEl}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ArticleLine
// ─────────────────────────────────────────────────────────────────────────────

export type LineVariant = 'quiet' | 'photo' | 'bubble' | 'signpost'

export function ArticleLineBlock({
  variant = 'quiet',
  text,
  accent,
  image,
  alt,
  focal,
  tone,
  layout,
}: {
  variant?: LineVariant
  text?: string
  accent?: string
  image?: string
  alt?: string
  focal?: string
  tone?: string
  layout?: LayoutValue
}) {
  const line = accentize(text, accent, variant === 'photo')
  if (variant === 'photo' && image) {
    return (
      <section className={`${sectionClass('art-line', 'photo', 'none', layout, 'py-0')} !px-0`} data-art="line">
        <div className="art-line-frame relative grid min-h-[min(78vh,45rem)] place-items-center overflow-hidden px-4 py-24 sm:px-6">
          <Photo src={image} alt={alt ?? ''} sizes="100vw" focal={focal} className="art-line-photo absolute inset-0" />
          <span className="art-scrim" aria-hidden="true" />
          <p className="art-line-text relative z-10 mx-auto max-w-4xl text-center font-display text-on-ink text-balance text-[clamp(30px,4.6vw,64px)] leading-[1.04]">
            {line}
          </p>
        </div>
      </section>
    )
  }
  if (variant === 'bubble') {
    return (
      <section className={sectionClass('art-line', 'bubble', tone, layout, 'py-14 sm:py-20')} data-art="line">
        <div className="mx-auto max-w-4xl">
          <p className="art-bubble relative font-display text-text text-balance text-[clamp(26px,3.4vw,46px)] leading-[1.08]">
            {line}
          </p>
        </div>
      </section>
    )
  }
  if (variant === 'signpost') {
    return (
      <section className={sectionClass('art-line', 'signpost', tone, layout, 'py-10 sm:py-14')} data-art="line">
        <div className="mx-auto grid max-w-5xl grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-10">
          <div className="art-rail relative flex justify-center" aria-hidden="true">
            <span className="art-pin" />
          </div>
          <p className="art-sign font-display text-text text-balance text-[clamp(24px,3vw,40px)] leading-[1.08]">{line}</p>
        </div>
      </section>
    )
  }
  return (
    <section className={sectionClass('art-line', 'quiet', tone, layout, 'py-24 sm:py-36')} data-art="line">
      <span className="art-orb fq-breathe" aria-hidden="true" />
      <p className="art-quiet-text relative z-10 mx-auto max-w-3xl text-center font-display text-text text-balance text-[clamp(30px,4.4vw,60px)] leading-[1.06]">
        {line}
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ArticleStory
// ─────────────────────────────────────────────────────────────────────────────

export type StoryVariant = 'chapter' | 'overlap' | 'bento' | 'pinned'

export function ArticleStoryBlock({
  variant = 'chapter',
  image,
  alt,
  image2,
  alt2,
  focal,
  eyebrow,
  title,
  titleAccent,
  kicker,
  body,
  ctaLabel,
  ctaHref,
  links,
  side = 'left',
  tone,
  layout,
}: {
  variant?: StoryVariant
  image?: string
  alt?: string
  image2?: string
  alt2?: string
  focal?: string
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  body?: string
  ctaLabel?: string
  ctaHref?: string
  links?: LinkItem[]
  side?: 'left' | 'right'
  tone?: string
  layout?: LayoutValue
}) {
  const src = image || '/images/site/community-1.jpg'
  const head = (
    <>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      {title && (
        <h2 className="art-story-title font-display text-text text-balance text-[clamp(28px,3.8vw,52px)] leading-[1.04]">
          {accentize(title, titleAccent)}
        </h2>
      )}
      {kicker && <p className="mt-4 text-lead italic text-muted">{kicker}</p>}
    </>
  )
  const cta = ctaLabel && ctaHref ? <CtaButton href={ctaHref} label={ctaLabel} variant="secondary" /> : null
  const actions =
    cta || (links ?? []).length > 0 ? (
      <div className="art-links mt-8 flex flex-wrap gap-3">
        {cta}
        {(links ?? [])
          .filter((l) => l.label && l.href)
          .map((l, i) => (
            <CtaButton key={i} href={l.href} label={l.label} variant={l.variant ?? 'secondary'} />
          ))}
      </div>
    ) : null
  const paras = (body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  const rev = side === 'right'

  if (variant === 'overlap') {
    return (
      <section className={sectionClass('art-story', 'overlap', tone, layout)} data-art="story">
        <div className={`mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-0`}>
          <div className={`art-stack relative pb-10 sm:pb-16 ${rev ? 'lg:order-2' : ''}`}>
            <Photo
              src={src}
              alt={alt ?? ''}
              focal={focal}
              sizes="(min-width: 1024px) 40vw, 92vw"
              className={`art-card-a fq-iri-rim aspect-[4/3] w-[88%] rounded-card ${rev ? 'ml-auto' : ''}`}
            />
            {image2 && (
              <Photo
                src={image2}
                alt={alt2 ?? ''}
                sizes="(min-width: 1024px) 22vw, 50vw"
                className={`art-card-b absolute bottom-0 aspect-[4/3] w-[52%] rounded-card ${rev ? 'left-0' : 'right-0'}`}
              />
            )}
          </div>
          <div
            className={`art-overlap-text relative z-10 rounded-card border border-border bg-surface p-6 sm:p-10 ${
              rev ? 'lg:order-1 lg:-mr-16' : 'lg:-ml-16'
            }`}
          >
            {head}
            {paras.length > 0 && (
              <div className="mt-6 text-body-lg text-muted leading-relaxed space-y-4">{richParagraphs(body)}</div>
            )}
            {actions}
          </div>
        </div>
      </section>
    )
  }

  if (variant === 'bento') {
    return (
      <section className={sectionClass('art-story', 'bento', tone, layout)} data-art="story">
        <div className="art-bento mx-auto grid max-w-6xl gap-3 sm:gap-4 md:grid-cols-6">
          <div className="art-tile art-tile-head relative overflow-hidden rounded-card p-6 sm:p-8 md:col-span-3">{head}</div>
          <Photo
            src={src}
            alt={alt ?? ''}
            focal={focal}
            sizes="(min-width: 768px) 50vw, 92vw"
            className={`art-tile art-tile-photo min-h-60 rounded-card md:col-span-3 ${image2 ? 'md:row-span-1' : 'md:row-span-2'}`}
          />
          {paras.map((p, i) => (
            <div
              key={i}
              className={`art-tile art-tile-tip rounded-card border border-border bg-surface p-6 sm:p-8 text-body-lg text-muted leading-relaxed ${
                paras.length === 1 ? 'md:col-span-3' : i === 0 ? 'md:col-span-3' : image2 ? 'md:col-span-4' : 'md:col-span-3'
              }`}
            >
              <span className="art-tip-num font-display" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="mt-3 space-y-3">{richParagraphs(p)}</div>
            </div>
          ))}
          {image2 && (
            <Photo
              src={image2}
              alt={alt2 ?? ''}
              sizes="(min-width: 768px) 33vw, 92vw"
              className="art-tile art-tile-photo min-h-52 rounded-card md:col-span-2"
            />
          )}
          {actions && <div className="art-tile md:col-span-6">{actions}</div>}
        </div>
      </section>
    )
  }

  if (variant === 'pinned') {
    return (
      <section className={sectionClass('art-story', 'pinned', tone, layout)} data-art="story">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:gap-14">
          <div className={`lg:sticky lg:top-28 lg:self-start ${rev ? 'lg:order-2' : ''}`}>
            <Photo
              src={src}
              alt={alt ?? ''}
              focal={focal}
              sizes="(min-width: 1024px) 45vw, 92vw"
              className="art-pinned-photo fq-iri-rim aspect-[4/5] w-full rounded-card"
            />
          </div>
          <div className="min-w-0">
            {head}
            <ul className="mt-8 space-y-4">
              {paras.map((p, i) => (
                <li key={i} className="art-panel relative rounded-card border border-border bg-surface p-6 pl-16 sm:p-8 sm:pl-20">
                  <span className="art-check" aria-hidden="true">
                    <Check className="h-5 w-5" />
                  </span>
                  <div className="text-body-lg text-muted leading-relaxed space-y-3">{richParagraphs(p)}</div>
                </li>
              ))}
            </ul>
            {actions}
          </div>
        </div>
      </section>
    )
  }

  // chapter: the photo IS the section; the heading sits on glass over it, the body below in a calm column.
  return (
    <section className={sectionClass('art-story', 'chapter', 'none', layout, 'pb-16 sm:pb-24')} data-art="story">
      <div className="art-chapter-frame relative -mx-4 sm:-mx-6">
        <Photo src={src} alt={alt ?? ''} focal={focal} sizes="100vw" className="art-chapter-photo h-[min(82vh,47.5rem)] min-h-[26rem] w-full" />
        <span className="art-scrim" aria-hidden="true" />
        <div className={`absolute inset-x-0 bottom-0 z-10 px-4 pb-8 sm:px-6 sm:pb-12`}>
          <div className={`mx-auto flex max-w-6xl ${rev ? 'justify-end' : ''}`}>
            <div className="art-glass fq-glass max-w-xl rounded-card p-6 sm:p-8">{head}</div>
          </div>
        </div>
      </div>
      {(paras.length > 0 || actions) && (
        <div className="mx-auto mt-12 max-w-2xl sm:mt-16">
          <div className="text-body-lg text-muted leading-relaxed space-y-5">{richParagraphs(body)}</div>
          {actions}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ArticleSteps
// ─────────────────────────────────────────────────────────────────────────────

export type StepsVariant = 'trail' | 'stack' | 'path' | 'timeline'

export function ArticleStepsBlock({
  variant = 'trail',
  schema = 'howto',
  eyebrow,
  name,
  intro,
  totalTime,
  totalTimeLabel,
  steps,
  tone,
  layout,
}: {
  variant?: StepsVariant
  schema?: 'howto' | 'none'
  eyebrow?: string
  name?: string
  intro?: string
  totalTime?: string
  totalTimeLabel?: string
  steps?: StepItem[]
  tone?: string
  layout?: LayoutValue
}) {
  const shown = (steps ?? []).filter((s) => s.name || s.text)
  // Same builder and the same fail-closed rule as DawnHowToSteps: a node only when it is valid.
  const node = schema === 'howto' ? howToStepsSchema({ name, intro, totalTime, steps }) : null
  const n = (i: number) => String(i + 1).padStart(2, '0')
  return (
    <section className={sectionClass('art-steps', variant, tone, layout)} data-art="steps">
      {node && <JsonLd data={node} />}
      <span className="fq-aura art-steps-aura" aria-hidden="true" />
      <div className={`relative z-10 mx-auto ${variant === 'path' || variant === 'timeline' ? 'max-w-6xl' : 'max-w-4xl'}`}>
        {(eyebrow || name) && (
          <div className="mb-10 max-w-2xl sm:mb-14">
            {eyebrow && name && <Eyebrow>{eyebrow}</Eyebrow>}
            {name && (
              <h2 className="font-display text-text text-balance text-[clamp(28px,4vw,52px)] leading-[1.04]">{name}</h2>
            )}
            {intro && <div className="mt-5 text-body-lg text-muted leading-relaxed space-y-4">{richParagraphs(intro)}</div>}
            {totalTimeLabel && <p className="eyebrow mt-5 text-muted">{totalTimeLabel}</p>}
          </div>
        )}
        <ol className={`art-steps-list art-steps-list-${variant}`} style={{ ['--art-n' as string]: shown.length }}>
          {shown.map((s, i) => (
            <li key={i} className="art-step relative">
              <span className="art-step-num font-display" aria-hidden="true">
                {n(i)}
              </span>
              <div className="art-step-card">
                {s.name && <h3 className="text-body-lg font-bold text-text">{s.name}</h3>}
                {s.text && <div className="mt-2 text-body text-muted leading-relaxed space-y-3">{richParagraphs(s.text)}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

const stepsArrayField = {
  type: 'array' as const,
  label: 'Steps (in order)',
  arrayFields: {
    name: { type: 'text' as const, label: 'Step name' },
    text: { type: 'textarea' as const, label: 'What to do (**bold**, *italic*, [link](/path))' },
    image: imgField,
    alt: { type: 'text' as const, label: 'Alt text' },
  },
  getItemSummary: (item: StepItem) => item.name || 'Step',
}

export const ARTICLE_BLOCK_TYPES = ['ArticleQuestion', 'ArticleLine', 'ArticleStory', 'ArticleSteps'] as const

export const articleComponents: Record<string, ComponentConfig> = {
  ArticleQuestion: {
    label: 'Article question (H2, answer, body)',
    fields: {
      variant: variantField('Layout', [
        ['quiet', 'Quiet column'],
        ['talk', 'Asked and answered'],
        ['path', 'Numbered path'],
        ['panel', 'Side heading + panel'],
      ]),
      number: { type: 'text', label: 'Number (path and panel layouts)' },
      question: { type: 'textarea', label: 'Question (the H2; blank makes this the opening answer)' },
      answer: { type: 'textarea', label: 'Direct answer ([link](/path) works)' },
      body: { type: 'textarea', label: 'Body (optional, [link](/path) works)' },
      links: linksField,
      note: { type: 'textarea', label: 'Closing note under the buttons (optional)' },
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      variant: 'quiet',
      number: '',
      question: 'What is a Circle?',
      answer: 'A small group around something you care about that meets on a set rhythm.',
      body: '',
      links: [],
      note: '',
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ variant, number, question, answer, body, links, note, tone, layout }) => (
      <ArticleQuestionBlock
        variant={variant as QuestionVariant}
        number={(number as string) || undefined}
        question={(question as string) || undefined}
        answer={(answer as string) || undefined}
        body={(body as string) || undefined}
        links={links as LinkItem[]}
        note={(note as string) || undefined}
        tone={tone as string}
        layout={layout as LayoutValue}
      />
    ),
  },

  ArticleLine: {
    label: 'Article line (one display sentence)',
    fields: {
      variant: variantField('Layout', [
        ['quiet', 'Quiet, with a breathing orb'],
        ['photo', 'Over a photo'],
        ['bubble', 'In a bubble'],
        ['signpost', 'Signpost on a path'],
      ]),
      text: { type: 'textarea', label: 'The sentence' },
      accent: { type: 'text', label: 'Accent phrase (optional)' },
      image: imgField,
      alt: { type: 'text', label: 'Alt text (photo layout)' },
      focal: focalField,
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      variant: 'quiet',
      text: 'The same room, more than once.',
      accent: 'more than once.',
      image: '',
      alt: '',
      focal: 'center',
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ variant, text, accent, image, alt, focal, tone, layout }) => (
      <ArticleLineBlock
        variant={variant as LineVariant}
        text={(text as string) || undefined}
        accent={(accent as string) || undefined}
        image={(image as string) || undefined}
        alt={(alt as string) || undefined}
        focal={focal as string}
        tone={tone as string}
        layout={layout as LayoutValue}
      />
    ),
  },

  ArticleStory: {
    label: 'Article story (photo and text)',
    fields: {
      variant: variantField('Layout', [
        ['chapter', 'Full-bleed photo chapter'],
        ['overlap', 'Overlapping photo cards'],
        ['bento', 'Tips bento'],
        ['pinned', 'Photo beside checklist panels'],
      ]),
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      image2: imgField,
      alt2: { type: 'text', label: 'Second photo alt text (optional)' },
      focal: focalField,
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Title' },
      titleAccent: { type: 'text', label: 'Accent word (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      body: { type: 'textarea', label: 'Body (paragraphs split by a blank line, [link](/path) works)' },
      ctaLabel: { type: 'text', label: 'Button label (optional)' },
      ctaHref: { type: 'text', label: 'Button link (optional)' },
      links: linksField,
      side: variantField('Photo side', [
        ['left', 'Left'],
        ['right', 'Right'],
      ]),
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      variant: 'chapter',
      image: '/images/site/community-1.jpg',
      alt: 'A small group gathered on a lawn',
      image2: '',
      alt2: '',
      focal: 'center',
      eyebrow: '',
      title: 'A standing room with the same faces.',
      titleAccent: '',
      kicker: '',
      body: 'Write a paragraph here.',
      ctaLabel: '',
      ctaHref: '',
      links: [],
      side: 'left',
      tone: 'surface',
      layout: layoutDefault,
    },
    render: (p) => (
      <ArticleStoryBlock
        variant={p.variant as StoryVariant}
        image={(p.image as string) || undefined}
        alt={(p.alt as string) || undefined}
        image2={(p.image2 as string) || undefined}
        alt2={(p.alt2 as string) || undefined}
        focal={p.focal as string}
        eyebrow={(p.eyebrow as string) || undefined}
        title={(p.title as string) || undefined}
        titleAccent={(p.titleAccent as string) || undefined}
        kicker={(p.kicker as string) || undefined}
        body={(p.body as string) || undefined}
        ctaLabel={(p.ctaLabel as string) || undefined}
        ctaHref={(p.ctaHref as string) || undefined}
        links={p.links as LinkItem[]}
        side={p.side as 'left' | 'right'}
        tone={p.tone as string}
        layout={p.layout as LayoutValue}
      />
    ),
  },

  ArticleSteps: {
    label: 'Article steps (ordered, optional HowTo schema)',
    fields: {
      variant: variantField('Layout', [
        ['trail', 'Quiet trail'],
        ['stack', 'Stacked cards'],
        ['path', 'Path with dotted connectors'],
        ['timeline', 'Timeline'],
      ]),
      schema: variantField('Structured data', [
        ['howto', 'Emit HowTo (needs a guide name)'],
        ['none', 'None (steps are copy only)'],
      ]),
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      name: { type: 'textarea', label: 'Guide name (the heading AND the HowTo name)' },
      intro: { type: 'textarea', label: 'Intro paragraph (also the HowTo description)' },
      totalTimeLabel: { type: 'text', label: 'Time it takes, in words (optional)' },
      totalTime: { type: 'text', label: 'Time it takes, ISO 8601 (e.g. PT30M). Blank is fine.' },
      steps: stepsArrayField,
      tone: toneField,
      layout: layoutField,
    },
    defaultProps: {
      variant: 'trail',
      schema: 'howto',
      eyebrow: 'How to',
      name: 'How to start a Circle',
      intro: '',
      totalTimeLabel: '',
      totalTime: '',
      steps: [
        { name: 'Pick one thing', text: 'One simple thing the group does together.', image: '', alt: '' },
        { name: 'Set a standing time', text: 'The same day and time, on repeat.', image: '', alt: '' },
      ],
      tone: 'surface',
      layout: layoutDefault,
    },
    render: ({ variant, schema, eyebrow, name, intro, totalTime, totalTimeLabel, steps, tone, layout }) => (
      <ArticleStepsBlock
        variant={variant as StepsVariant}
        schema={schema as 'howto' | 'none'}
        eyebrow={(eyebrow as string) || undefined}
        name={(name as string) || undefined}
        intro={(intro as string) || undefined}
        totalTime={(totalTime as string) || undefined}
        totalTimeLabel={(totalTimeLabel as string) || undefined}
        steps={steps as StepItem[]}
        tone={tone as string}
        layout={layout as LayoutValue}
      />
    ),
  },
}
