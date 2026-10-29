import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { InlineText } from '@/components/sites/inline-text'
import { TempleKitContactForm } from '@/components/sites/temple-kit-inner/contact-form'

// ── The Temple Theme Kit inner-page blocks, group A (About, Ceremonies and hire, Contact) ────────────────────
// Block types TempleKitInner<Part>, one per section the design's inner pages are built from (docs/design-systems/
// temple, ui_kits/site AboutPage, ServicesPage). Server Components, except the contact form. Every look is the
// kit's own sheet (components/sites/temple-kit-inner/inner-css.ts), tokens only and scoped to the site render. A
// photo left empty draws the kit's plaster wash, so a Space that has not added photos yet still reads whole.
// `*stars*` in a heading set the words in the accent italic.

export type Props = Record<string, unknown>
export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
export const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
export const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
export const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
export const lines = (v: unknown) => str(v).split('\n').map((s) => s.trim()).filter(Boolean)
export const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

/** A link through the site's link map. `~/page` means "this Space's page". Kept as written without a map. */
export function hrefOf(raw: string, metadata: Props | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('#')) return raw
  const links = metadata?.links as SiteLinkMap | undefined
  if (!links) return raw.startsWith('~/') ? `/spaces/space/${raw.slice(2)}` : safeUrl(raw) || (raw.startsWith('/') ? raw : null)
  const own = raw.startsWith('~/') ? `/spaces/${links.slug}/${raw.slice(2)}` : raw
  if (links.contactHref && /^mailto:/i.test(own)) return links.contactHref
  return siteLocalHref(own, links)?.href ?? (/^\/(?:spaces|circles|events|market)(?:\/|[?#]|$)|^\/sign-in(?:[?#]|$)/.test(own) ? `${links.origin}${own}` : null)
}

export const Mark = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
export const MARKS = { check: 'M20 6 9 17l-5-5', mail: 'M4 6h16v12H4zM4 7l8 6 8-6', pin: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' } as const

/** The three glyphs the design's service rows wear: a circle, a triangle and a square, drawn plain. */
const SIGILS: Record<string, ReactNode> = {
  circle: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>,
  triangle: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><path d="M12 4 21 20H3z" /></svg>,
  square: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="14" /></svg>,
}

// ── Hero ───────────────────────────────────────────────────────────────────────────────────────────────────

function HeroBlock({ p, pad, vis }: { p: Props; pad?: string; vis?: string }) {
  const src = img(p.image)
  const tall = str(p.height) === 'tall'
  return (
    <section data-tki="hero" className={cls('tki-hero', tall && 'tki-hero--tall', !src && 'tki-hero--bare', pad, vis)}>
      {src && <div className="tki-hero-media" style={{ backgroundImage: `url(${JSON.stringify(src)})` }} role="img" aria-label={str(p.alt)} />}
      <div className="tki-hero-veil" aria-hidden="true" />
      <div className="tki-hero-copy">
        {str(p.eyebrow) && <div className="tki-eyebrow tki-eyebrow--on-media">{str(p.eyebrow)}</div>}
        <h1 className="tki-hero-title"><InlineText text={str(p.title)} /></h1>
        {str(p.lead) && <p className="tki-hero-lead">{str(p.lead)}</p>}
      </div>
    </section>
  )
}

// ── Story ──────────────────────────────────────────────────────────────────────────────────────────────────

function StoryBlock({ p, pad, vis }: { p: Props; pad?: string; vis?: string }) {
  const src = img(p.image)
  const paras = lines(p.body)
  return (
    <section data-tki="story" className={cls('tki-section tki-story', pad, vis)}>
      <div className="tki-story-head">
        <div className="tki-eyebrow">
          {str(p.index) && <span className="tki-index">{str(p.index)}</span>}
          {str(p.eyebrow)}
        </div>
        <h2 className="tki-title"><InlineText text={str(p.title)} /></h2>
        {(src || str(p.caption)) && (
          <figure className="tki-arch">
            <div className="tki-arch-frame">{src && <div className="tki-arch-img" style={{ backgroundImage: `url(${JSON.stringify(src)})` }} role="img" aria-label={str(p.alt)} />}</div>
            {str(p.caption) && <figcaption>{str(p.caption)}</figcaption>}
          </figure>
        )}
      </div>
      <div className="tki-prose">
        {paras.map((t, i) => (
          <p key={i} className={i === 0 ? 'tki-prose-first' : undefined}>{t}</p>
        ))}
      </div>
    </section>
  )
}

// ── Team ───────────────────────────────────────────────────────────────────────────────────────────────────

function TeamBlock({ p, pad, vis }: { p: Props; pad?: string; vis?: string }) {
  const people = arr(p.people).map((x) => ({ name: str(x.name), line: str(x.line), photo: img(x.photo) })).filter((x) => x.name)
  if (people.length === 0) return null
  return (
    <section data-tki="team" className={cls('tki-section tki-team', pad, vis)}>
      <div className="tki-ornament"><span>{str(p.label)}</span></div>
      <ul className="tki-people">
        {people.map((x, i) => (
          <li key={i} className="tki-person">
            <span className="tki-avatar" aria-hidden="true">{x.photo ? <span style={{ backgroundImage: `url(${JSON.stringify(x.photo)})` }} /> : initials(x.name)}</span>
            <span>
              <strong>{x.name}</strong>
              {x.line && <span className="tki-person-line">{x.line}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Stats ──────────────────────────────────────────────────────────────────────────────────────────────────

function StatsBlock({ p, pad, vis }: { p: Props; pad?: string; vis?: string }) {
  const src = img(p.image)
  const stats = arr(p.stats).map((x) => ({ value: str(x.value), label: str(x.label) })).filter((x) => x.value)
  if (stats.length === 0) return null
  return (
    <section data-tki="stats" className={cls('tki-stats', pad, vis)}>
      <div className={cls('tki-stats-media', !src && 'tki-bare')} style={src ? { backgroundImage: `url(${JSON.stringify(src)})` } : undefined} role={src ? 'img' : undefined} aria-label={src ? str(p.alt) : undefined} />
      <dl className="tki-stats-grid">
        {stats.map((x, i) => (
          <div key={i}>
            <dt className="tki-stat-value">{x.value}</dt>
            <dd className="tki-stat-label">{x.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ── Service row ────────────────────────────────────────────────────────────────────────────────────────────

function ServiceBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const src = img(p.image)
  const flip = str(p.side) === 'right'
  const to = str(p.ctaLabel) ? hrefOf(str(p.ctaHref), metadata) : null
  const points = lines(p.points)
  return (
    <section data-tki="service" className={cls('tki-service', flip && 'tki-service--flip', pad, vis)}>
      <div className={cls('tki-service-media', !src && 'tki-bare')} style={src ? { backgroundImage: `url(${JSON.stringify(src)})` } : undefined} role={src ? 'img' : undefined} aria-label={src ? str(p.alt) : undefined} />
      <div className="tki-service-copy">
        <span className="tki-sigil">{SIGILS[str(p.sigil)] ?? SIGILS.circle}</span>
        <div className="tki-eyebrow">
          {str(p.index) && <span className="tki-index">{str(p.index)}</span>}
          {str(p.eyebrow)}
        </div>
        <h2 className="tki-service-title">{str(p.title)}</h2>
        {str(p.lead) && <p className="tki-service-lead">{str(p.lead)}</p>}
        {points.length > 0 && (
          <ul className="tki-points">
            {points.map((t, i) => (
              <li key={i}><Mark d={MARKS.check} />{t}</li>
            ))}
          </ul>
        )}
        {(to || str(p.note)) && (
          <div className="tki-service-foot">
            {to && <a className="hs-btn hs-btn-primary" href={to}>{str(p.ctaLabel)}</a>}
            {str(p.note) && <span className="tki-note">{str(p.note)}</span>}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Contact ────────────────────────────────────────────────────────────────────────────────────────────────

function ContactBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const src = img(p.image)
  const links = metadata?.links as SiteLinkMap | undefined
  const space = metadata?.space as { profile?: { email?: string; address?: string } } | undefined
  const email = str(p.email) || str(space?.profile?.email)
  const place = str(p.place) || str(space?.profile?.address)
  return (
    <section data-tki="contact" className={cls('tki-contact', !src && 'tki-contact--bare', pad, vis)}>
      <div className="tki-contact-media" style={src ? { backgroundImage: `url(${JSON.stringify(src)})` } : undefined} role={src ? 'img' : undefined} aria-label={src ? str(p.alt) : undefined}>
        <div className="tki-hero-veil" aria-hidden="true" />
        <div className="tki-contact-copy">
          <h1 className="tki-hero-title"><InlineText text={str(p.title)} /></h1>
          {(email || place) && (
            <ul className="tki-contact-lines">
              {email && <li><Mark d={MARKS.mail} />{email}</li>}
              {place && <li><Mark d={MARKS.pin} />{place}</li>}
            </ul>
          )}
        </div>
      </div>
      <div className="tki-contact-form">
        <TempleKitContactForm slug={links?.slug ?? null} intro={str(p.intro)} topics={lines(p.topics)} buttonLabel={str(p.buttonLabel)} successTitle={str(p.successTitle)} successBody={str(p.successBody)} />
      </div>
    </section>
  )
}

// ── Questions ──────────────────────────────────────────────────────────────────────────────────────────────

function FaqBlock({ p, metadata, pad, vis }: { p: Props; metadata?: Props; pad?: string; vis?: string }) {
  const space = metadata?.space as { faqs?: { question?: unknown; answer?: unknown }[] } | undefined
  const live = Array.isArray(space?.faqs) ? space.faqs.map((f) => ({ q: str(f.question), a: str(f.answer) })).filter((f) => f.q && f.a) : []
  const items = live.length ? live : arr(p.items).map((f) => ({ q: str(f.q), a: str(f.a) })).filter((f) => f.q && f.a)
  if (items.length === 0) return null
  return (
    <section data-tki="faq" className={cls('tki-section tki-faq', pad, vis)}>
      <h2 className="tki-title"><InlineText text={str(p.title)} /></h2>
      <div className="tki-faq-list">
        {items.map((f, i) => (
          <details key={i} open={i === 0}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

// ── Registry ───────────────────────────────────────────────────────────────────────────────────────────────

export const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
export const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
export const image = { ...loomImageField, label: 'Photo' }
export const alt = text('Photo description', 'For screen readers.')
export const VOICE_HINT = 'Wrap words in *stars* to set them in the accent italic.'

export function block<P extends Props>(label: string, fields: Record<string, unknown>, defaults: P, Comp: (args: { p: Props; metadata?: Props; pad?: string; vis?: string }) => ReactNode): ComponentConfig {
  return {
    label,
    fields: { ...fields, layout: layoutField },
    defaultProps: { ...defaults, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => <Comp p={props} metadata={props.puck?.metadata} {...layoutOf(props.layout)} />,
  } as unknown as ComponentConfig
}

export const templeKitInnerComponents: Record<string, ComponentConfig> = {
  TempleKitInnerHero: block('Temple page hero', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Intro'), image, alt,
    height: { type: 'radio', label: 'Height', options: [{ label: 'Short', value: 'short' }, { label: 'Tall', value: 'tall' }] },
  }, { eyebrow: '', title: '', lead: '', image: '', alt: '', height: 'short' }, HeroBlock),
  TempleKitInnerStory: block('Temple story with arch photo', {
    index: text('Numeral', 'Like I or II.'), eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), body: area('Story', 'Each new line is one paragraph.'), image, alt, caption: text('Photo caption'),
  }, { index: '', eyebrow: '', title: '', body: '', image: '', alt: '', caption: '' }, StoryBlock),
  TempleKitInnerTeam: block('Temple team cards', {
    label: text('Label on the line'),
    people: { type: 'array', label: 'People', arrayFields: { name: text('Name'), line: text('Role and what they hold'), photo: image } },
  }, { label: 'The team', people: [] }, TeamBlock),
  TempleKitInnerStats: block('Temple photo and numbers', {
    image, alt,
    stats: { type: 'array', label: 'Numbers', arrayFields: { value: text('Number'), label: text('Label') } },
  }, { image: '', alt: '', stats: [] }, StatsBlock),
  TempleKitInnerService: block('Temple service row', {
    index: text('Numeral'), eyebrow: text('Small label'), title: text('Name'), lead: area('Description'), points: area('What is included', 'Each new line is one point.'),
    sigil: { type: 'radio', label: 'Mark', options: [{ label: 'Circle', value: 'circle' }, { label: 'Triangle', value: 'triangle' }, { label: 'Square', value: 'square' }] },
    ctaLabel: text('Button'), ctaHref: text('Button link', 'Start with ~/ for a page of this site, like ~/contact.'), note: text('Note beside the button', 'Like From $2,400 · half day.'),
    image, alt, side: { type: 'radio', label: 'Photo side', options: [{ label: 'Left', value: 'left' }, { label: 'Right', value: 'right' }] },
  }, { index: '', eyebrow: '', title: '', lead: '', points: '', sigil: 'circle', ctaLabel: '', ctaHref: '', note: '', image: '', alt: '', side: 'left' }, ServiceBlock),
  TempleKitInnerFaq: block('Temple questions', {
    title: area('Heading', VOICE_HINT),
    items: { type: 'array', label: 'Questions', hint: 'The Space\'s own questions, when it has them, show instead.', arrayFields: { q: text('Question'), a: area('Answer') } },
  }, { title: 'Common *questions*', items: [] }, FaqBlock),
  TempleKitInnerContact: block('Temple contact form', {
    title: area('Heading', VOICE_HINT), image, alt, email: text('Email on the photo', 'Left empty, it reads the email in Business Info.'), place: text('Place on the photo', 'Left empty, it reads the address in Business Info.'),
    intro: area('Line above the form'), topics: area('Things people can ask about', 'Each new line is one choice.'), buttonLabel: text('Button'), successTitle: text('Thank-you heading'), successBody: text('Thank-you line'),
  }, { title: '', image: '', alt: '', email: '', place: '', intro: '', topics: '', buttonLabel: 'Send message', successTitle: 'Received.', successBody: 'We reply within two days.' }, ContactBlock),
}
