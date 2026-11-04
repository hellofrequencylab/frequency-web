// THE SITE STORY BLOCKS (owner 2026-11-04, on the marketing pages: "they are all really flat and text based.
// Make each a different layout that speaks to the feature, program or service."). Five page-editor blocks
// that give the editor-backed story and playbook pages their own skeletons on the design system's textures,
// so the layout stays in the document an operator edits and never in a route file (check:render-path):
//
//   FounderChapters   /about                  the founding story as photo-led chapters on a dotted spine
//   PrincipleOrbit    /about                  four principles held around one orb (infographics.css orbit)
//   PlaybookCover     /how-to-build-community the playbook's cover: title beside a photo, the chapter index
//                                             on glass over it
//   PlaybookChapter   /how-to-build-community a numbered chapter mark over the section's H2, signal line above
//   ToolStack         /how-to-build-community the four jobs, scattered across apps against held in one Space
//
// Every word a block shows is a prop, so the template carries the copy and an operator can change it. The
// heading levels are the ones the blocks they replace emitted (StoryBeats, ValueBand: H2 and H3; Hero: H1;
// Heading: H2). Images go through next/image's optimizer (getImageProps), sized to the slot. The look is
// app/themes/frequency/site-pages-story.css, loaded only by a page that renders one of these, under the
// Frequency design (the stub imports nothing elsewhere). Additive: no other block file changes.
import '@/app/themes/active/site-pages-story'
import { getImageProps } from 'next/image'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { imgField } from '@/lib/page-editor/fields'
import { richParagraphs, safeHref } from '@/lib/page-editor/richtext'
import { layoutField, layoutDefault, visClass, type LayoutValue, type ComponentConfig } from './kit'

/** The src, srcSet and sizes for a photo slot. The nominal 1600 by 1066 only seeds the candidate list. */
function img(src: string, sizes: string) {
  const { props } = getImageProps({ src, alt: '', width: 1600, height: 1066, sizes })
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes }
}

/** Paragraphs split on a blank line, the way StoryBeats reads its body. */
function paras(body?: string): string[] {
  return (body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** The accent phrase of a heading in the kit's serif italic, as accentize does for the DAWN blocks. */
function accent(title?: string, phrase?: string) {
  const t = title ?? ''
  if (!phrase || !t.includes(phrase)) return t
  const i = t.indexOf(phrase)
  return (
    <>
      {t.slice(0, i)}
      <em>{phrase}</em>
      {t.slice(i + phrase.length)}
    </>
  )
}

const ICONS: FqIconName[] = ['compass', 'crew', 'wallet', 'home', 'door', 'circle', 'message', 'award', 'space', 'event']
const iconField = {
  type: 'select' as const,
  label: 'Icon',
  options: ICONS.map((i) => ({ label: i, value: i })),
}

// ── FounderChapters ──────────────────────────────────────────────────────────

type Chapter = { label?: string; title?: string; body?: string; image?: string; alt?: string; caption?: string }

export function FounderChaptersBlock({
  eyebrow,
  kicker,
  items,
  vis,
}: {
  eyebrow?: string
  kicker?: string
  items?: Chapter[]
  vis?: string
}) {
  const chapters = (items ?? []).filter((c) => c.title || c.body)
  return (
    <section className={`sec st-fc ${vis ?? ''}`}>
      <div className="wrap">
        <ol className="st-fc-list">
          {chapters.map((c, i) => (
            <li key={i} className={i % 2 ? 'st-fc-ch is-rev' : 'st-fc-ch'}>
              <span className="st-fc-n" aria-hidden="true">
                {c.label || String(i + 1).padStart(2, '0')}
              </span>
              {c.image && (
                <figure className={i === 0 ? 'st-fc-ph is-portrait fq-iri-rim' : 'st-fc-ph fq-iri-rim'}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- optimizer srcset via getImageProps; the slot sizes the element */}
                  <img loading="lazy" decoding="async" {...img(c.image, '(max-width: 860px) 100vw, 46vw')} alt={c.alt ?? ''} />
                  <span className="fq-grain" aria-hidden="true" />
                  {c.caption && <figcaption className="fq-glass">{c.caption}</figcaption>}
                </figure>
              )}
              <div className="st-fc-tx">
                {i === 0 && eyebrow && (
                  <div className="label">
                    <b>{eyebrow}</b>
                  </div>
                )}
                <h2 className="h-l">{c.title}</h2>
                {i === 0 && kicker && <p className="st-kicker">{kicker}</p>}
                {paras(c.body).map((p, j) => (
                  <p key={j} className={i === 0 && j === 0 ? 'st-lead' : undefined}>
                    {p}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── PrincipleOrbit ───────────────────────────────────────────────────────────

type Principle = { icon?: string; title?: string; body?: string }

export function PrincipleOrbitBlock({
  eyebrow,
  title,
  titleAccent,
  kicker,
  items,
  vis,
}: {
  eyebrow?: string
  title?: string
  titleAccent?: string
  kicker?: string
  items?: Principle[]
  vis?: string
}) {
  const list = (items ?? []).filter((p) => p.title || p.body)
  return (
    <section className={`sec st-po ${vis ?? ''}`}>
      <span className="fq-aura" aria-hidden="true" />
      <span className="fq-grain" aria-hidden="true" />
      <div className="wrap">
        <div className="sh st-po-sh">
          {eyebrow && (
            <div className="label">
              <b>{eyebrow}</b>
            </div>
          )}
          <h2 className="h-l">{accent(title, titleAccent)}</h2>
          {kicker && <p className="st-kicker">{kicker}</p>}
        </div>
        <div className={`st-po-field n${list.length}`}>
          <span className="st-po-ring" aria-hidden="true" />
          <span className="st-po-core" aria-hidden="true">
            <i />
          </span>
          {list.map((p, i) => (
            <article key={i} className="st-po-card fq-panel">
              <span className="st-po-ic">
                <FqIcon name={(ICONS.includes(p.icon as FqIconName) ? p.icon : 'compass') as FqIconName} />
              </span>
              <h3>{p.title}</h3>
              {p.body && <p>{p.body}</p>}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── PlaybookCover ────────────────────────────────────────────────────────────

type ChapterLink = { label?: string; href?: string }

export function PlaybookCoverBlock({
  eyebrow,
  title,
  subtitle,
  image,
  alt,
  indexLabel,
  chapters,
  vis,
}: {
  eyebrow?: string
  title?: string
  subtitle?: string
  image?: string
  alt?: string
  indexLabel?: string
  chapters?: ChapterLink[]
  vis?: string
}) {
  const list = (chapters ?? []).filter((c) => c.label)
  return (
    <section className={`st-pb ${vis ?? ''}`}>
      <span className="fq-aura" aria-hidden="true" />
      <div className="wrap st-pb-in">
        <div className="st-pb-tx">
          {eyebrow && (
            <div className="label">
              <b>{eyebrow}</b>
            </div>
          )}
          <h1 className="h-xl">{title}</h1>
          {subtitle && <p className="st-lead">{subtitle}</p>}
        </div>
        <div className="st-pb-art">
          {image && (
            <figure className="st-pb-ph">
              {/* eslint-disable-next-line @next/next/no-img-element -- optimizer srcset via getImageProps; the slot sizes the element */}
              <img {...img(image, '(max-width: 960px) 100vw, 50vw')} alt={alt ?? ''} />
              <span className="fq-grain" aria-hidden="true" />
            </figure>
          )}
          {list.length > 0 && (
            <nav className="st-pb-idx fq-panel fq-iri-rim" aria-label={indexLabel || 'Chapters'}>
              {indexLabel && <p className="st-pb-idx-h">{indexLabel}</p>}
              <ol>
                {list.map((c, i) => (
                  <li key={i}>
                    <a href={c.href || '#'}>
                      <span className="st-pb-n" aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>{c.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}

// ── PlaybookChapter ──────────────────────────────────────────────────────────

export function PlaybookChapterBlock({
  anchor,
  number,
  total,
  title,
  vis,
}: {
  anchor?: string
  number?: string
  total?: string
  title?: string
  vis?: string
}) {
  return (
    <section className={`st-ch ${vis ?? ''}`} id={anchor || undefined}>
      <span className="st-sig" aria-hidden="true" />
      <div className="wrap st-ch-in">
        {number && (
          <p className="st-ch-mark">
            <span className="st-ch-num">{number}</span>
            {total && <span className="st-ch-of">of {total}</span>}
          </p>
        )}
        <h2 className="h-l">{title}</h2>
      </div>
    </section>
  )
}

// ── ToolStack ────────────────────────────────────────────────────────────────

type Job = { icon?: string; job?: string; scattered?: string; together?: string }

export function ToolStackBlock({
  scatteredLabel,
  togetherLabel,
  jobs,
  note,
  vis,
}: {
  scatteredLabel?: string
  togetherLabel?: string
  jobs?: Job[]
  note?: string
  vis?: string
}) {
  const list = (jobs ?? []).filter((j) => j.job)
  return (
    <section className={`st-ts ${vis ?? ''}`}>
      <div className="wrap">
        <div className="st-ts-panel fq-panel">
          <table className="st-ts-t">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Job</span>
                </th>
                <th scope="col" className="st-ts-off">
                  {scatteredLabel}
                </th>
                <th scope="col" className="st-ts-on">
                  {togetherLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((j, i) => (
                <tr key={i}>
                  <th scope="row">
                    <span className="st-ts-ic">
                      <FqIcon name={(ICONS.includes(j.icon as FqIconName) ? j.icon : 'circle') as FqIconName} />
                    </span>
                    {j.job}
                  </th>
                  <td className="st-ts-off">
                    <span>{j.scattered}</span>
                  </td>
                  <td className="st-ts-on">
                    <span>{j.together}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {note && <div className="st-ts-note">{richParagraphs(note)}</div>}
        </div>
      </div>
    </section>
  )
}

// ── The config ───────────────────────────────────────────────────────────────

export const siteStoryComponents: Record<string, ComponentConfig> = {
  FounderChapters: {
    label: 'Founder chapters (photo-led story)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (first chapter)' },
      kicker: { type: 'textarea', label: 'Italic kicker (first chapter)' },
      items: {
        type: 'array',
        label: 'Chapters',
        arrayFields: {
          label: { type: 'text', label: 'Marker (01, 2020)' },
          title: { type: 'textarea', label: 'Heading' },
          body: { type: 'textarea', label: 'Paragraphs (blank line between)' },
          image: imgField,
          alt: { type: 'text', label: 'Alt text' },
          caption: { type: 'text', label: 'Photo caption (optional)' },
        },
        getItemSummary: (item: Chapter) => item.title || 'Chapter',
      },
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'Where it comes from',
      kicker: '',
      items: [{ label: '01', title: 'A hunger nobody could name.', body: '', image: '', alt: '', caption: '' }],
      layout: layoutDefault,
    },
    render: ({ eyebrow, kicker, items, layout }) => (
      <FounderChaptersBlock
        eyebrow={(eyebrow as string) || undefined}
        kicker={(kicker as string) || undefined}
        items={items as Chapter[]}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  PrincipleOrbit: {
    label: 'Principle orbit (four around one)',
    fields: {
      eyebrow: { type: 'textarea', label: 'Eyebrow (optional)' },
      title: { type: 'textarea', label: 'Heading' },
      titleAccent: { type: 'text', label: 'Accent phrase (optional)' },
      kicker: { type: 'textarea', label: 'Italic kicker (optional)' },
      items: {
        type: 'array',
        label: 'Principles',
        arrayFields: {
          icon: iconField,
          title: { type: 'textarea', label: 'Name' },
          body: { type: 'textarea', label: 'Line' },
        },
        getItemSummary: (item: Principle) => item.title || 'Principle',
      },
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'What we believe',
      title: "The principles we won't trade away.",
      titleAccent: '',
      kicker: '',
      items: [{ icon: 'compass', title: 'Guru-free', body: '' }],
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, titleAccent, kicker, items, layout }) => (
      <PrincipleOrbitBlock
        eyebrow={(eyebrow as string) || undefined}
        title={title as string}
        titleAccent={(titleAccent as string) || undefined}
        kicker={(kicker as string) || undefined}
        items={items as Principle[]}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  PlaybookCover: {
    label: 'Playbook cover (title, photo, chapter index)',
    fields: {
      eyebrow: { type: 'text', label: 'Eyebrow' },
      title: { type: 'textarea', label: 'Title (the page H1)' },
      subtitle: { type: 'textarea', label: 'Subtitle' },
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      indexLabel: { type: 'text', label: 'Index heading' },
      chapters: {
        type: 'array',
        label: 'Chapters',
        arrayFields: {
          label: { type: 'textarea', label: 'Chapter' },
          href: { type: 'text', label: 'Anchor (#chapter-1)' },
        },
        getItemSummary: (item: ChapterLink) => item.label || 'Chapter',
      },
      layout: layoutField,
    },
    defaultProps: {
      eyebrow: 'Build',
      title: 'How to build community',
      subtitle: '',
      image: '',
      alt: '',
      indexLabel: 'In this playbook',
      chapters: [],
      layout: layoutDefault,
    },
    render: ({ eyebrow, title, subtitle, image, alt, indexLabel, chapters, layout }) => (
      <PlaybookCoverBlock
        eyebrow={(eyebrow as string) || undefined}
        title={title as string}
        subtitle={(subtitle as string) || undefined}
        image={(image as string) || undefined}
        alt={(alt as string) || undefined}
        indexLabel={(indexLabel as string) || undefined}
        chapters={((chapters as ChapterLink[]) ?? []).map((c) => ({ ...c, href: c.href?.startsWith('#') ? c.href : (safeHref(c.href) ?? undefined) }))}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  PlaybookChapter: {
    label: 'Playbook chapter (numbered heading)',
    fields: {
      anchor: { type: 'text', label: 'Anchor id (chapter-1)' },
      number: { type: 'text', label: 'Number (01)' },
      total: { type: 'text', label: 'Of (07, optional)' },
      title: { type: 'textarea', label: 'Heading (H2)' },
      layout: layoutField,
    },
    defaultProps: { anchor: '', number: '01', total: '', title: 'Chapter heading', layout: layoutDefault },
    render: ({ anchor, number, total, title, layout }) => (
      <PlaybookChapterBlock
        anchor={(anchor as string) || undefined}
        number={(number as string) || undefined}
        total={(total as string) || undefined}
        title={title as string}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },

  ToolStack: {
    label: 'Tool stack (scattered against one place)',
    fields: {
      scatteredLabel: { type: 'text', label: 'Left column' },
      togetherLabel: { type: 'text', label: 'Right column' },
      jobs: {
        type: 'array',
        label: 'Jobs',
        arrayFields: {
          icon: iconField,
          job: { type: 'text', label: 'Job' },
          scattered: { type: 'textarea', label: 'Scattered across apps' },
          together: { type: 'textarea', label: 'In one place' },
        },
        getItemSummary: (item: Job) => item.job || 'Job',
      },
      note: { type: 'textarea', label: 'Note under the panel (optional)' },
      layout: layoutField,
    },
    defaultProps: {
      scatteredLabel: 'Four apps',
      togetherLabel: 'One Space',
      jobs: [{ icon: 'door', job: 'A way in', scattered: '', together: '' }],
      note: '',
      layout: layoutDefault,
    },
    render: ({ scatteredLabel, togetherLabel, jobs, note, layout }) => (
      <ToolStackBlock
        scatteredLabel={(scatteredLabel as string) || undefined}
        togetherLabel={(togetherLabel as string) || undefined}
        jobs={jobs as Job[]}
        note={(note as string) || undefined}
        vis={visClass(layout as LayoutValue)}
      />
    ),
  },
}

/** The editor palette's Site story group (lib/page-editor/config.tsx; marketing only, palette-scope.ts). */
export const SITE_STORY_CATEGORY_COMPONENTS = Object.keys(siteStoryComponents)
