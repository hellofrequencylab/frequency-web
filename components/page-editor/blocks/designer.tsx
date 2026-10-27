import type { ReactNode } from 'react'
import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { loomImageField } from '@/lib/page-editor/loom-image-field'
import { InlineText } from '@/components/sites/inline-text'
import { DesignerInquiryForm } from '@/components/sites/designer-inquiry-form'
import { DesignerCarousel } from '@/components/sites/designer-carousel'
import { DesignerParallax } from '@/components/sites/designer-parallax'
import { DesignerFaqList } from '@/components/sites/designer-faq-list'
import {
  DESIGNER_BAND, DESIGNER_CLOSING, DESIGNER_FAQ, DESIGNER_FOUNDER, DESIGNER_GALLERY, DESIGNER_HERO, DESIGNER_INQUIRY, DESIGNER_PORTFOLIO,
  DESIGNER_QUOTE, DESIGNER_SERVICES, DESIGNER_STATEMENT, DESIGNER_STEPS, DESIGNER_TESTIMONIALS,
} from '@/lib/sites/designer-home'

// ── The Designer block family (Alli Rae Build + Design system, 2026-10-26) ───────────────────────────────────
// Every section of the design is one registered block here, in the design's markup: the full-bleed hero with its
// strip, the statement, the portfolio mosaic, the arch and its steps, the service slab, the testimonials, the
// founder split, the photo band, the questions, the quote and arch, the gallery, the closing call and the
// inquiry form. Server Components, except the carousel and the form. The questions read the Space's own rows
// from `puck.metadata.space` and fall back to the cards the owner wrote. Every look is the Designer skin's
// (components/sites/designer-blocks-css.ts), tokens only.

type Props = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })
const lines = (v: unknown) => str(v).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
const paras = (v: unknown) => str(v).split(/\r?\n\s*\r?\n|\r?\n/).map((l) => l.trim()).filter(Boolean)

/** A link through the site's link map. `~/page` means "this Space's page". Kept as written without a map. */
function hrefOf(raw: string, metadata: Props | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('#')) return raw
  const links = metadata?.links as SiteLinkMap | undefined
  if (!links) return raw.startsWith('~/') ? `/spaces/space/${raw.slice(2)}` : safeUrl(raw) || (raw.startsWith('/') ? raw : null)
  const own = raw.startsWith('~/') ? `/spaces/${links.slug}/${raw.slice(2)}` : raw
  if (links.contactHref && /^mailto:/i.test(own)) return links.contactHref
  return siteLocalHref(own, links)?.href ?? (/^\/(?:spaces|circles|events|market)(?:\/|[?#]|$)|^\/sign-in(?:[?#]|$)/.test(own) ? `${links.origin}${own}` : null)
}
const external = (href: string) => /^https?:\/\//.test(href)
const rel = (href: string) => (external(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})

type Kind = 'primary' | 'outline' | 'inverse' | 'light' | 'warm' | 'link'
function Btn({ label, href, kind = 'primary', metadata, arrow = false, large = false }: { label: string; href: string; kind?: Kind; metadata?: Props; arrow?: boolean; large?: boolean }) {
  const to = label ? hrefOf(href, metadata) : null
  if (!to) return null
  return (
    <a className={cls('dz-btn', `dz-btn-${kind}`)} data-size={large ? 'lg' : undefined} href={to} {...rel(to)}>
      {label}
      {(arrow || kind === 'link') && <span className="dz-arrow" aria-hidden="true">→</span>}
    </a>
  )
}

function Eyebrow({ text, center = false }: { text: string; center?: boolean }) {
  return text ? <div className={cls('dz-eyebrow', center && 'dz-eyebrow--center')} data-rule="">{text}</div> : null
}

function Photo({ src, alt }: { src: string | null; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
  return src ? <img src={src} alt={alt} loading="lazy" /> : null
}

function Arch({ src, alt, ratio = 'tall' }: { src: string | null; alt: string; ratio?: 'tall' | 'portrait' }) {
  if (!src) return null
  return (
    <figure className="dz-arch" data-ratio={ratio} data-frame="">
      <div className="dz-arch-frame"><Photo src={src} alt={alt} /></div>
    </figure>
  )
}

type Common = { p: Props; metadata?: Props; pad?: string; vis?: string }

function Section({ tone, slab, pad, vis, kind, children }: { tone?: 'linen' | 'warm' | 'deep' | 'photo'; slab?: boolean; pad?: string; vis?: string; kind: string; children: ReactNode }) {
  return (
    <section data-dz={kind} data-tone={tone} data-slab={slab ? '' : undefined} className={cls('dz-sec', pad, vis)}>
      {children}
    </section>
  )
}

// ── Hero ─────────────────────────────────────────────────────────────────────────────────

function DesignerHeroBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const strip = arr(p.strip).slice(0, 3).filter((s) => str(s.label) || str(s.value))
  return (
    <section data-dz="hero" data-size={str(p.size) || undefined} className={cls('dz-hero', str(p.size) === 'short' && 'dz-hero--short', pad, vis)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img className="dz-hero-photo" src={src} alt={str(p.alt)} />
      )}
      {src && <DesignerParallax />}
      <div className="dz-wrap dz-hero-copy">
        <Eyebrow text={str(p.eyebrow)} />
        <h1 className="dz-display"><InlineText text={str(p.title)} /></h1>
        {str(p.lead) && <p className="dz-lead">{str(p.lead)}</p>}
        {(str(p.primaryLabel) || str(p.secondaryLabel)) && (
          <div className="dz-actions">
            <Btn label={str(p.primaryLabel)} href={str(p.primaryHref)} kind="inverse" metadata={metadata} arrow large />
            <Btn label={str(p.secondaryLabel)} href={str(p.secondaryHref)} kind="light" metadata={metadata} large />
          </div>
        )}
      </div>
      {strip.length > 0 && (
        <div className="dz-strip">
          <div className="dz-wrap dz-strip-grid" style={{ '--dz-strip-cols': strip.length } as React.CSSProperties}>
            {strip.map((s, i) => {
              const to = hrefOf(str(s.href), metadata)
              const thumb = img(s.image)
              const inner = (
                <>
                  {thumb && <span className="dz-strip-thumb"><Photo src={thumb} alt="" /></span>}
                  <span className="dz-strip-text" data-flip={thumb ? '' : undefined}>
                    <span className="dz-strip-label">{str(s.label)}</span>
                    <span className="dz-strip-value">{str(s.value)}</span>
                  </span>
                </>
              )
              return to ? <a key={i} className="dz-strip-item" href={to} {...rel(to)}>{inner}</a> : <div key={i} className="dz-strip-item">{inner}</div>
            })}
            <div className="dz-strip-scroll" aria-hidden="true">Scroll<span /></div>
          </div>
        </div>
      )}
    </section>
  )
}

// ── Statement ─────────────────────────────────────────────────────────────────────────────

function DesignerStatementBlock({ p, metadata, pad, vis }: Common) {
  return (
    <Section kind="statement" pad={pad} vis={vis}>
      <div className="dz-wrap dz-statement">
        <div className="dz-statement-head">
          <Eyebrow text={str(p.eyebrow)} />
          {str(p.title) && <h2 className="dz-title"><InlineText text={str(p.title)} /></h2>}
        </div>
        <div className="dz-statement-body">
          {str(p.lead) && <p className="dz-statement-lead">{str(p.lead)}</p>}
          {str(p.meta) && <p className="dz-meta">{str(p.meta)}</p>}
          <div><Btn label={str(p.linkLabel)} href={str(p.linkHref)} kind="link" metadata={metadata} /></div>
        </div>
      </div>
    </Section>
  )
}

// ── Portfolio ─────────────────────────────────────────────────────────────────────────────

function ProjectCard({ x, metadata, size }: { x: Props; metadata?: Props; size?: 'lg' | 'wide' }) {
  const to = hrefOf(str(x.href), metadata)
  const src = img(x.image)
  const inner = (
    <>
      <Photo src={src} alt="" />
      <span className="dz-project-body">
        <span>
          <span className="dz-project-meta">{[str(x.location), str(x.year)].filter(Boolean).join(' · ')}</span>
          <span className="dz-project-title">{str(x.title)}</span>
          {to && <span className="dz-project-go">Explore this Project →</span>}
        </span>
      </span>
    </>
  )
  return to ? <a className="dz-project" data-size={size} href={to} {...rel(to)}>{inner}</a> : <article className="dz-project" data-size={size}>{inner}</article>
}

function DesignerPortfolioBlock({ p, metadata, pad, vis }: Common) {
  const list = arr(p.projects).filter((x) => str(x.title))
  const [a, ...rest] = list
  const hasHead = str(p.eyebrow) || str(p.title) || str(p.lead)
  return (
    <Section kind="portfolio" pad={pad} vis={vis}>
      <div className="dz-wrap">
        {hasHead && (
          <div className="dz-head">
            <div>
              <Eyebrow text={str(p.eyebrow)} />
              {str(p.title) && <h2 className="dz-title dz-title--xl"><InlineText text={str(p.title)} /></h2>}
            </div>
            {str(p.lead) && <p className="dz-lead">{str(p.lead)}</p>}
          </div>
        )}
        {a && (
          <div className="dz-mosaic">
            <ProjectCard x={a} metadata={metadata} size="lg" />
            {rest.length > 0 && <div className="dz-mosaic-stack">{rest.slice(0, 2).map((x, i) => <ProjectCard key={i} x={x} metadata={metadata} />)}</div>}
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Arch + numbered steps ─────────────────────────────────────────────────────────────────

function DesignerStepsBlock({ p, pad, vis }: Common) {
  const src = img(p.image)
  const steps = arr(p.steps).filter((s) => str(s.title))
  return (
    <Section kind="steps" tone="linen" pad={pad} vis={vis}>
      <div className={cls('dz-wrap dz-split', src ? 'dz-split--5-6' : 'dz-split--1-1')}>
        {src && <Arch src={src} alt={str(p.alt)} />}
        <div>
          <Eyebrow text={str(p.eyebrow)} />
          {str(p.title) && <h2 className="dz-title" style={{ margin: '20px 0 var(--dz-section-head)' }}><InlineText text={str(p.title)} /></h2>}
          <div className="dz-panel">
            {steps.map((s, i) => (
              <div key={i} className="dz-step">
                <span className="dz-disc" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3 className="dz-step-title">{str(s.title)}</h3>
                  {str(s.lead) && <p className="dz-step-lead">{str(s.lead)}</p>}
                  {str(s.body) && <p className="dz-body">{str(s.body)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Service tiles ─────────────────────────────────────────────────────────────────────────

function DesignerServicesBlock({ p, metadata, pad, vis }: Common) {
  const items = arr(p.services).filter((s) => str(s.name))
  const cols = Math.max(2, Math.min(4, Number(p.columns) || 4))
  const light = str(p.tone) === 'light'
  return (
    <Section kind="services" tone={light ? undefined : 'deep'} slab={!light} pad={pad} vis={vis}>
      <div className="dz-wrap">
        <div className="dz-bar" data-split={str(p.lead) ? '' : undefined}>
          <div className="dz-bar-copy">
            <Eyebrow text={str(p.eyebrow)} />
            {str(p.title) && <h2 className="dz-title"><InlineText text={str(p.title)} /></h2>}
          </div>
          {str(p.lead) && <p className="dz-body dz-bar-lead">{str(p.lead)}</p>}
          <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} kind={light ? 'outline' : 'light'} metadata={metadata} arrow />
        </div>
        <ul className={cls('dz-services', light && 'dz-services--light')} style={{ '--dz-cols': cols } as React.CSSProperties}>
          {items.map((s, i) => (
            <li key={i} className="dz-service"><b aria-hidden="true">{i + 1}</b>{str(s.name)}</li>
          ))}
        </ul>
        {str(p.closing) && (
          <div className="dz-closing">
            <p>{str(p.closing)}</p>
            <Btn label={str(p.closingLabel)} href={str(p.closingHref)} kind="inverse" metadata={metadata} arrow large />
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Testimonials ──────────────────────────────────────────────────────────────────────────

function DesignerTestimonialsBlock({ p, pad, vis }: Common) {
  const items = arr(p.items).filter((t) => str(t.quote))
  if (!items.length) return null
  const slides = items.map((t, i) => {
    const src = img(t.image)
    return (
      <figure key={i} className="dz-quote-card" data-solo={src ? undefined : ''} style={{ margin: 0 }}>
        {src && <div className="dz-quote-photo"><Arch src={src} alt="" /></div>}
        <div className="dz-quote-text">
          <span className="dz-quote-mark" aria-hidden="true">“</span>
          <blockquote className="dz-quote" style={{ margin: 0 }}>{str(t.quote)}</blockquote>
          {str(t.author) && <figcaption className="dz-quote-by" data-rule="">{str(t.author)}</figcaption>}
        </div>
      </figure>
    )
  })
  return (
    <Section kind="testimonials" pad={pad} vis={vis}>
      <div className="dz-wrap">
        <DesignerCarousel head={<Eyebrow text={str(p.eyebrow)} />} slides={slides} />
      </div>
    </Section>
  )
}

// ── Founder ───────────────────────────────────────────────────────────────────────────────

function DesignerFounderBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const body = paras(p.paragraphs)
  return (
    <Section kind="founder" tone="warm" pad={pad} vis={vis}>
      <div className={cls('dz-wrap dz-split', src ? 'dz-split--6-5' : 'dz-split--1-1')}>
        <div className="dz-founder-copy">
          <Eyebrow text={str(p.eyebrow)} />
          {str(p.title) && <h2 className="dz-title dz-title--italic"><InlineText text={str(p.title)} /></h2>}
          {str(p.lead) && <p className="dz-founder-lead"><InlineText text={str(p.lead)} /></p>}
          {body.map((t, i) => <p key={i} className="dz-body">{t}</p>)}
          <div><Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} kind="outline" metadata={metadata} arrow /></div>
        </div>
        {src && (
          <div className="dz-founder-photo">
            <Arch src={src} alt={str(p.alt)} ratio="portrait" />
            {str(p.quote) && (
              <div className="dz-float">
                <p>{str(p.quote)}</p>
                {str(p.quoteBy) && <div className="dz-eyebrow" data-rule="">{str(p.quoteBy)}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Photo band + three frosted cards ──────────────────────────────────────────────────────

function DesignerBandBlock({ p, metadata, pad, vis }: Common) {
  const src = img(p.image)
  const cards = arr(p.cards).filter((c) => str(c.title))
  return (
    <section data-dz="band" data-tone="photo" className={cls('dz-sec dz-band', pad, vis)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
        <img className="dz-band-photo" src={src} alt={str(p.alt)} />
      )}
      <div className="dz-wrap">
        <div className="dz-band-head">
          <Eyebrow text={str(p.eyebrow)} center />
          {str(p.title) && <h2 className="dz-title"><InlineText text={str(p.title)} /></h2>}
        </div>
        <div className="dz-cards">
          {cards.map((c, i) => (
            <div key={i} className="dz-glass">
              <span className="dz-disc" aria-hidden="true">{i + 1}</span>
              <h3>{str(c.title)}</h3>
              {lines(c.lines).map((l, k) => <p key={k}>{l}</p>)}
            </div>
          ))}
        </div>
        <div className="dz-band-cta"><Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} kind="inverse" metadata={metadata} arrow large /></div>
      </div>
    </section>
  )
}

// ── Questions ─────────────────────────────────────────────────────────────────────────────

interface FaqBag { faqs?: { id: string; question: string; answer: string }[] }

function DesignerFAQBlock({ p, metadata, pad, vis }: Common) {
  const own = ((metadata?.space ?? undefined) as FaqBag | undefined)?.faqs ?? []
  const items = own.length ? own.map((f) => ({ q: f.question, a: f.answer, list: [] as string[] })) : arr(p.items).map((f) => ({ q: str(f.q), a: str(f.a), list: lines(f.list) }))
  if (!items.length) return null
  const phone = str(p.phone)
  const email = str(p.email)
  const hasCard = phone || email || str(p.buttonLabel)
  return (
    <Section kind="faq" pad={pad} vis={vis}>
      <div className="dz-wrap dz-faq-grid">
        <div className="dz-faq-side">
          {str(p.title) && <h2 className="dz-title">{str(p.title)}</h2>}
          {hasCard && (
            <div className="dz-card">
              {str(p.contactLabel) && <div className="dz-eyebrow">{str(p.contactLabel)}</div>}
              {phone && <a className="dz-card-phone" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>}
              {email && <a className="dz-card-mail" href={`mailto:${email}`}>{email}</a>}
              <div><Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} kind="primary" metadata={metadata} arrow /></div>
            </div>
          )}
        </div>
        <DesignerFaqList items={items.filter((f) => f.q)} />
      </div>
    </Section>
  )
}

// ── Quote + arch ──────────────────────────────────────────────────────────────────────────

function DesignerQuoteBlock({ p, pad, vis }: Common) {
  const src = img(p.image)
  return (
    <Section kind="quote" tone="linen" pad={pad} vis={vis}>
      <div className={cls('dz-wrap dz-split', src ? 'dz-split--1-1' : undefined)}>
        <div className="dz-big-quote">
          <span className="dz-quote-mark" aria-hidden="true">“</span>
          <h2 className="dz-title"><InlineText text={str(p.title)} /></h2>
          {str(p.body) && <p className="dz-body">{str(p.body)}</p>}
        </div>
        {src && <Arch src={src} alt={str(p.alt)} />}
      </div>
    </Section>
  )
}

// ── Gallery ───────────────────────────────────────────────────────────────────────────────

function DesignerGalleryBlock({ p, pad, vis }: Common) {
  const shots = arr(p.images).map((x) => ({ src: img(x.image), alt: str(x.alt) })).filter((x) => x.src).slice(0, 3)
  if (!shots.length) return null
  return (
    <section data-dz="gallery" className={cls('dz-sec', pad, vis)} style={{ paddingTop: 0 }}>
      <div className="dz-wrap">
        <div className="dz-gallery" data-count={shots.length}>
          {shots.map((s, i) => <figure key={i} className="dz-shot"><Photo src={s.src} alt={s.alt} /></figure>)}
        </div>
      </div>
    </section>
  )
}

// ── Closing call + next project ───────────────────────────────────────────────────────────

function DesignerClosingBlock({ p, metadata, pad, vis }: Common) {
  const next = (p.next && typeof p.next === 'object' ? p.next : {}) as Props
  const hasNext = !!str(next.title)
  return (
    <Section kind="closing" tone="warm" slab pad={pad} vis={vis}>
      <div className={cls('dz-wrap dz-split', hasNext ? 'dz-split--1-1' : undefined)}>
        <div className="dz-next-copy">
          <h2 className="dz-title dz-title--italic"><InlineText text={str(p.title)} /></h2>
          <Btn label={str(p.buttonLabel)} href={str(p.buttonHref)} kind="primary" metadata={metadata} arrow large />
        </div>
        {hasNext && (
          <div>
            <Eyebrow text={str(p.nextEyebrow)} />
            <div style={{ marginTop: 24 }}><ProjectCard x={next} metadata={metadata} size="wide" /></div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Inquiry form ──────────────────────────────────────────────────────────────────────────

function DesignerInquiryBlock({ p, metadata, pad, vis }: Common) {
  const links = metadata?.links as SiteLinkMap | undefined
  const src = img(p.image)
  return (
    <Section kind="inquiry" tone="linen" pad={pad} vis={vis}>
      <div className="dz-wrap dz-inquiry">
        <div className="dz-inquiry-copy">
          <Eyebrow text={str(p.eyebrow)} />
          <h1 className="dz-title"><InlineText text={str(p.title)} /></h1>
          {paras(p.paragraphs).map((t, i) => <p key={i} className="dz-body">{t}</p>)}
          {src && <div className="dz-inquiry-photo"><Photo src={src} alt={str(p.alt)} /></div>}
        </div>
        <DesignerInquiryForm
          slug={links?.slug ?? null}
          variant={str(p.variant) === 'consult' ? 'consult' : 'project'}
          services={lines(p.services)}
          submitLabel={str(p.submitLabel)}
          successTitle={str(p.successTitle)}
          successBody={str(p.successBody)}
        />
      </div>
    </Section>
  )
}

// ── Registry ─────────────────────────────────────────────────────────────────────────────

const text = (label: string, hint?: string) => ({ type: 'text', label, ...(hint ? { hint } : {}) }) as const
const area = (label: string, hint?: string) => ({ type: 'textarea', label, ...(hint ? { hint } : {}) }) as const
const image = { ...loomImageField, label: 'Photo' }
const VOICE_HINT = 'Wrap words in *stars* to set them in the italic.'
const LINK_HINT = 'Start with ~/ for a page of this site, like ~/contact.'
const alt = text('Photo description', 'For screen readers.')

function block<P extends Props>(label: string, fields: Record<string, unknown>, defaults: P, Comp: (args: Common) => ReactNode): ComponentConfig {
  return {
    label,
    fields: { ...fields, layout: layoutField },
    defaultProps: { ...defaults, layout: layoutDefault },
    render: (props: Props & { puck?: { metadata?: Props } }) => <Comp p={props} metadata={props.puck?.metadata} {...layoutOf(props.layout)} />,
  } as unknown as ComponentConfig
}

export const designerComponents: Record<string, ComponentConfig> = {
  DesignerHero: block('Designer hero', {
    size: { type: 'select', label: 'Height', options: [{ label: 'Full screen', value: 'full' }, { label: 'Full screen, smaller heading', value: 'page' }, { label: 'Short', value: 'short' }] },
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Intro'),
    primaryLabel: text('Main button'), primaryHref: text('Main button link', LINK_HINT), secondaryLabel: text('Second button'), secondaryHref: text('Second button link', LINK_HINT),
    image, alt,
    strip: { type: 'array', label: 'Strip along the bottom (up to three)', hint: 'Facts, or projects with a small photo.', arrayFields: { label: text('Label'), value: text('Words'), image, href: text('Link', LINK_HINT) } },
  }, { ...DESIGNER_HERO }, DesignerHeroBlock),
  DesignerStatement: block('Designer statement', {
    eyebrow: text('Small label'), title: area('Heading (italic)'), lead: area('Statement'), meta: text('Small line in caps'), linkLabel: text('Link'), linkHref: text('Link goes to', LINK_HINT),
  }, { ...DESIGNER_STATEMENT }, DesignerStatementBlock),
  DesignerPortfolio: block('Designer portfolio', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Intro'),
    projects: { type: 'array', label: 'Projects', hint: 'The first is shown large.', arrayFields: { image, title: text('Name'), location: text('Place'), year: text('Year'), href: text('Link', LINK_HINT) } },
  }, { ...DESIGNER_PORTFOLIO }, DesignerPortfolioBlock),
  DesignerSteps: block('Designer arch and steps', {
    image, alt, eyebrow: text('Small label'), title: area('Heading'),
    steps: { type: 'array', label: 'Steps', arrayFields: { title: text('Name'), lead: text('Italic line'), body: area('Words') } },
  }, { ...DESIGNER_STEPS }, DesignerStepsBlock),
  DesignerServices: block('Designer services', {
    tone: { type: 'select', label: 'Look', options: [{ label: 'Dark slab', value: 'deep' }, { label: 'Light', value: 'light' }] },
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Line under the heading'),
    columns: { type: 'number', label: 'Columns', min: 2, max: 4 },
    services: { type: 'array', label: 'Services', arrayFields: { name: text('Name') } },
    buttonLabel: text('Button'), buttonHref: text('Button link', LINK_HINT), closing: area('Closing line'), closingLabel: text('Closing button'), closingHref: text('Closing button link', LINK_HINT),
  }, { ...DESIGNER_SERVICES }, DesignerServicesBlock),
  DesignerTestimonials: block('Designer testimonials', {
    eyebrow: text('Small label'),
    items: { type: 'array', label: 'Testimonials', arrayFields: { quote: area('Quote'), author: text('Name'), image } },
  }, { ...DESIGNER_TESTIMONIALS }, DesignerTestimonialsBlock),
  DesignerFounder: block('Designer founder', {
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), lead: area('Large line'), paragraphs: area('Paragraphs', 'A blank line starts a new paragraph.'),
    buttonLabel: text('Button'), buttonHref: text('Button link', LINK_HINT), image, alt, quote: area('Quote on the photo'), quoteBy: text('Quote credit'),
  }, { ...DESIGNER_FOUNDER }, DesignerFounderBlock),
  DesignerBand: block('Designer photo band', {
    image, alt, eyebrow: text('Small label'), title: area('Heading'),
    cards: { type: 'array', label: 'Three cards', arrayFields: { title: text('Name (italic)'), lines: area('Lines', 'One per line. The first is set in the italic.') } },
    buttonLabel: text('Button'), buttonHref: text('Button link', LINK_HINT),
  }, { ...DESIGNER_BAND }, DesignerBandBlock),
  DesignerFAQ: block('Designer questions (live)', {
    title: text('Heading'), contactLabel: text('Contact card label'), phone: text('Phone'), email: text('Email'), buttonLabel: text('Button'), buttonHref: text('Button link', LINK_HINT),
    items: { type: 'array', label: 'Questions', hint: 'Used when the Space has no questions of its own.', arrayFields: { q: text('Question'), a: area('Answer'), list: area('Numbered list under the answer', 'One per line.') } },
  }, { ...DESIGNER_FAQ }, DesignerFAQBlock),
  DesignerQuote: block('Designer quote and arch', {
    title: area('Quote'), body: area('Words under it'), image, alt,
  }, { ...DESIGNER_QUOTE }, DesignerQuoteBlock),
  DesignerGallery: block('Designer gallery', {
    images: { type: 'array', label: 'Photos (up to three)', arrayFields: { image, alt } },
  }, { ...DESIGNER_GALLERY }, DesignerGalleryBlock),
  DesignerClosing: block('Designer closing call', {
    title: area('Heading', VOICE_HINT), buttonLabel: text('Button'), buttonHref: text('Button link', LINK_HINT), nextEyebrow: text('Next project label'),
    next: { type: 'object', label: 'Next project', objectFields: { image, title: text('Name'), location: text('Place'), year: text('Year'), href: text('Link', LINK_HINT) } },
  }, { ...DESIGNER_CLOSING }, DesignerClosingBlock),
  DesignerInquiry: block('Designer inquiry form', {
    variant: { type: 'select', label: 'Kind', options: [{ label: 'Start a project', value: 'project' }, { label: 'Book a consultation', value: 'consult' }] },
    eyebrow: text('Small label'), title: area('Heading', VOICE_HINT), paragraphs: area('Words beside the form'), image, alt,
    services: area('Services to pick from', 'One per line.'), submitLabel: text('Send button'), successTitle: text('Thank-you heading'), successBody: text('Thank-you line'),
  }, { ...DESIGNER_INQUIRY }, DesignerInquiryBlock),
}

export const DESIGNER_CATEGORY_COMPONENTS = Object.keys(designerComponents)
