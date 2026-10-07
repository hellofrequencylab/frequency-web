import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { accentSegments } from '@/lib/sites/house-theme'
import { ContactFormBlock, type ContactFormBlockProps } from '@/components/spaces/contact-form-block'

// THE HOUSE WEBSITE THEME'S SECTIONS (components/sites, owner ask 2026-10-07). PRESENTATIONAL: every word,
// image and link arrives in the model, resolved from the Space's own blocks and data by house-home.tsx. This
// file holds no copy of its own, so nothing here can overwrite what an owner wrote. A section whose data is
// empty is never built (house-home.tsx drops it), so these components only ever draw real content.

export interface HouseLink {
  href: string
  label: string
  external?: boolean
}

export interface HouseHeroModel {
  photo: string
  focus: string
  title: string
  lede: string | null
  cta: HouseLink | null
  secondary: HouseLink | null
  pill: HouseLink | null
  start: {
    eyebrow: string | null
    name: string
    role: string | null
    logo: string | null
    body: string | null
    cta: HouseLink | null
  } | null
}

export interface HouseFacts {
  eyebrow: string | null
  title: string | null
  items: { value: string; label: string }[]
}

export type HouseBlockModel =
  | { kind: 'who'; key: string; eyebrow: string | null; title: string | null; lead: string | null; signs: string[]; closing: string | null }
  | {
      kind: 'steps'
      key: string
      anchor: string | null
      eyebrow: string | null
      title: string | null
      subtitle: string | null
      steps: { n: string; title: string; body: string }[]
    }
  | {
      kind: 'story'
      key: string
      anchor: string | null
      eyebrow: string | null
      title: string | null
      image: string | null
      alt: string
      body: string[]
      pull: string | null
      facts: HouseFacts | null
      /** Set the facts as a full-width row under the photo and text, not inside the text column. */
      factsBelow?: boolean
    }
  | ({ kind: 'facts'; key: string } & HouseFacts)
  | {
      kind: 'sessions'
      key: string
      anchor: string | null
      eyebrow: string | null
      title: string | null
      cards: { length: string | null; price: string | null; title: string; body: string | null; cta: HouseLink | null }[]
    }
  | {
      kind: 'community'
      key: string
      anchor: string | null
      eyebrow: string | null
      title: string | null
      body: string | null
      button: HouseLink | null
      quote: string | null
      tiers: { name: string; description: string | null; price: string; href: string }[]
      note: string | null
    }
  | { kind: 'faq'; key: string; anchor: string | null; eyebrow: string | null; title: string | null; items: { q: string; a: string[] }[] }
  | {
      kind: 'closing'
      key: string
      anchor: string | null
      eyebrow: string | null
      title: string | null
      body: string | null
      button: HouseLink | null
      photo: string | null
      contact: {
        title: string | null
        address: string | null
        mapsHref: string | null
        hours: string[]
        phone: string | null
        email: string | null
        links: HouseLink[]
      } | null
    }
  | {
      kind: 'inquiry'
      key: string
      anchor: string | null
      eyebrow: string | null
      title: string | null
      body: string[]
      /** The Contact form block's own settings, passed through to the CRM-wired form. */
      form: Omit<ContactFormBlockProps, 'eyebrow' | 'title' | 'body' | 'variant'>
      /** The page's hero (the Contact page): the heading is the page's h1 and the form leads the page. */
      hero?: boolean
    }
  | { kind: 'other'; key: string; node: ReactNode }

/** A headline with the owner's `*accent*` marks set in the accent italic. */
function Accent({ text }: { text: string }) {
  return (
    <>
      {accentSegments(text).map((s, i) =>
        s.accent ? (
          <em key={i} className="hs-accent">
            {s.text}
          </em>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

function linkProps(l: HouseLink) {
  return l.external ? { href: l.href, target: '_blank', rel: 'noopener noreferrer' } : { href: l.href }
}

function Heading({ eyebrow, title, center }: { eyebrow: ReactNode; title: string | null; center?: boolean }) {
  if (!eyebrow && !title) return null
  const inner = (
    <>
      {eyebrow && <span className="hs-eyebrow">{eyebrow}</span>}
      {title && (
        <h2 className="hs-h2">
          <Accent text={title} />
        </h2>
      )}
    </>
  )
  return center ? <div className="hs-center">{inner}</div> : inner
}

export function HouseHero({ hero }: { hero: HouseHeroModel }) {
  return (
    <section className="hs-hero">
      {/* eslint-disable-next-line @next/next/no-img-element -- operator cover on an arbitrary host */}
      <img src={hero.photo} alt="" fetchPriority="high" className="hs-hero-photo" style={{ objectPosition: hero.focus }} />
      <div className="hs-hero-wash" aria-hidden />
      <div className="hs-hero-side" aria-hidden />
      <div className="hs-hero-grid">
        <div className="hs-hero-copy">
          {hero.pill && (
            <a {...linkProps(hero.pill)} className="hs-hero-pill">
              <span className="hs-dot" aria-hidden />
              {hero.pill.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          <h1 className="hs-h1">
            <Accent text={hero.title} />
          </h1>
          {hero.lede && <p className="hs-hero-lede">{hero.lede}</p>}
          {(hero.cta || hero.secondary) && (
            <div className="hs-hero-actions">
              {hero.cta && (
                <a {...linkProps(hero.cta)} className="hs-btn hs-btn-primary">
                  {hero.cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              )}
              {hero.secondary && (
                <a {...linkProps(hero.secondary)} className="hs-btn hs-btn-glass">
                  {hero.secondary.label}
                </a>
              )}
            </div>
          )}
        </div>
        {hero.start && (
          <div className="hs-start">
            {hero.start.eyebrow && <span className="hs-eyebrow">{hero.start.eyebrow}</span>}
            <div className="hs-start-who">
              {/* eslint-disable-next-line @next/next/no-img-element -- operator logo on an arbitrary host */}
              {hero.start.logo && <img src={hero.start.logo} alt="" />}
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span className="hs-serif" style={{ fontSize: '1.45rem' }}>
                  {hero.start.name}
                </span>
                {hero.start.role && (
                  <span className="hs-muted" style={{ fontSize: 14 }}>
                    {hero.start.role}
                  </span>
                )}
              </div>
            </div>
            {hero.start.body && (
              <p className="hs-muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
                {hero.start.body}
              </p>
            )}
            {hero.start.cta && (
              <a {...linkProps(hero.start.cta)} className="hs-start-row">
                <span>{hero.start.cta.label}</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function FactsGrid({ items, wide }: { items: HouseFacts['items']; wide?: boolean }) {
  return (
    <div className={wide ? 'hs-facts hs-facts-wide' : 'hs-facts'}>
      {items.map((f, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="hs-fact-v">{f.value}</span>
          <span className="hs-fact-l">{f.label}</span>
        </div>
      ))}
    </div>
  )
}

export function HouseBlock({ block, first }: { block: HouseBlockModel; first: boolean }) {
  const top = first ? ' hs-section-first' : ''
  switch (block.kind) {
    case 'who':
      return (
        <section className={`hs-section${top}`}>
          <div className="hs-split" style={{ alignItems: 'start' }}>
            <div className="hs-stack">
              <Heading eyebrow={block.eyebrow} title={block.title} />
              {block.lead && <p className="hs-lead">{block.lead}</p>}
            </div>
            {(block.signs.length > 0 || block.closing) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {block.signs.map((s, i) => (
                  <div key={i} className="hs-sign">
                    {s}
                  </div>
                ))}
                {block.closing && <p className="hs-pull">{block.closing}</p>}
              </div>
            )}
          </div>
        </section>
      )
    case 'steps':
      return (
        <section id={block.anchor ?? undefined} className={`hs-wide${top}`}>
          <div className="hs-panel">
            <Heading center eyebrow={block.eyebrow} title={block.title} />
            {block.subtitle && (
              <p className="hs-lead" style={{ textAlign: 'center', margin: '-24px auto 48px', maxWidth: '36em' }}>
                {block.subtitle}
              </p>
            )}
            <div className="hs-steps">
              {block.steps.map((s, i) => (
                <div key={i} className="hs-step">
                  <span className="hs-step-n">{s.n}</span>
                  {s.title && <h3>{s.title}</h3>}
                  {s.body && <p>{s.body}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )
    case 'story':
      return (
        <section id={block.anchor ?? undefined} className={`hs-section${top}`}>
          <div className="hs-split" style={{ alignItems: 'center' }}>
            {block.image && (
              <div className="hs-photo">
                {/* eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host */}
                <img src={block.image} alt={block.alt} loading="lazy" />
              </div>
            )}
            <div className="hs-stack" style={{ gap: 22 }}>
              <Heading eyebrow={block.eyebrow} title={block.title} />
              {block.body.map((p, i) => (
                <p key={i} className="hs-lead" style={{ fontSize: '1.1rem', lineHeight: 1.75 }}>
                  {p}
                </p>
              ))}
              {block.pull && <p className="hs-quote">{block.pull}</p>}
              {block.facts && !block.factsBelow && (
                <div>
                  {(block.facts.eyebrow || block.facts.title) && (
                    <p className="hs-fact-l" style={{ margin: '16px 0 0' }}>
                      {[block.facts.eyebrow, block.facts.title].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <FactsGrid items={block.facts.items} />
                </div>
              )}
            </div>
          </div>
          {block.facts && block.factsBelow && (
            <div className="hs-facts-row">
              {(block.facts.eyebrow || block.facts.title) && (
                <p className="hs-eyebrow" style={{ margin: 0 }}>
                  {[block.facts.eyebrow, block.facts.title].filter(Boolean).join(' · ')}
                </p>
              )}
              <FactsGrid items={block.facts.items} wide />
            </div>
          )}
        </section>
      )
    case 'facts':
      return (
        <section className={`hs-section${top}`}>
          <Heading center eyebrow={block.eyebrow} title={block.title} />
          <FactsGrid items={block.items} />
        </section>
      )
    case 'sessions':
      return (
        <section id={block.anchor ?? undefined} className={`hs-section${top}`}>
          <Heading center eyebrow={block.eyebrow} title={block.title} />
          <div className="hs-cards">
            {block.cards.map((c, i) => (
              <div key={i} className="hs-card">
                {(c.length || c.price) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-subtle)' }}>{c.length}</span>
                    <span className="hs-serif" style={{ fontSize: '1.7rem' }}>
                      {c.price}
                    </span>
                  </div>
                )}
                <h3>{c.title}</h3>
                {c.body && <p>{c.body}</p>}
                {c.cta && (
                  <a {...linkProps(c.cta)} className={`hs-btn ${i === 0 ? 'hs-btn-primary' : 'hs-btn-soft'}`} style={i === 0 ? { padding: '14px 24px', fontSize: 'inherit' } : undefined}>
                    {c.cta.label}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )
    case 'community':
      return (
        <section id={block.anchor ?? undefined} className={`hs-section${top}`}>
          <div className="hs-split" style={{ alignItems: 'center', gap: 'clamp(40px,6vw,88px)' }}>
            <div className="hs-stack">
              <Heading
                eyebrow={
                  block.eyebrow ? (
                    <span className="hs-eyebrow" style={{ color: 'var(--color-signal-strong)' }}>
                      <span className="hs-dot" aria-hidden />
                      {block.eyebrow}
                    </span>
                  ) : null
                }
                title={block.title}
              />
              {block.body && <p className="hs-lead" style={{ fontSize: '1.1rem' }}>{block.body}</p>}
              {block.button && (
                <a {...linkProps(block.button)} className="hs-btn hs-btn-light" style={{ alignSelf: 'flex-start' }}>
                  {block.button.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              )}
            </div>
            {(block.quote || block.tiers.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {block.quote && (
                  <p className="hs-serif" style={{ margin: '0 0 6px', fontStyle: 'italic', fontSize: '1.35rem', lineHeight: 1.45 }}>
                    {block.quote}
                  </p>
                )}
                {block.tiers.map((t, i) => (
                  <a key={i} href={t.href} className="hs-tier">
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="hs-serif" style={{ fontSize: '1.4rem' }}>
                          {t.name}
                        </span>
                        <span className="hs-chip">{t.price}</span>
                      </span>
                      {t.description && <span className="hs-muted" style={{ fontSize: 15 }}>{t.description}</span>}
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0" style={{ color: 'var(--color-primary-strong)' }} aria-hidden />
                  </a>
                ))}
                {block.note && (
                  <span style={{ fontSize: 14, color: 'var(--color-text-subtle)', paddingLeft: 4 }}>{block.note}</span>
                )}
              </div>
            )}
          </div>
        </section>
      )
    case 'faq':
      return (
        <section id={block.anchor ?? undefined} className={`hs-section${top}`} style={{ maxWidth: 820 }}>
          <Heading center eyebrow={block.eyebrow} title={block.title} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {block.items.map((item, i) => (
              // `name` makes the group exclusive: opening one closes the others, with no script.
              <details key={i} name={`${block.key}-faq`} open={i === 0} className="hs-faq">
                <summary>{item.q}</summary>
                <div className="hs-faq-a">
                  {item.a.map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      )
    case 'closing':
      return (
        <section id={block.anchor ?? undefined} className={`hs-wide${top}`} style={{ paddingBottom: 'clamp(48px,6vw,72px)' }}>
          <div className="hs-band">
            {block.photo && (
              // eslint-disable-next-line @next/next/no-img-element -- operator photo on an arbitrary host
              <img src={block.photo} alt="" loading="lazy" className="hs-band-photo" />
            )}
            <div className="hs-band-wash" aria-hidden />
            <div className="hs-band-grid">
              {(block.title || block.body || block.button || block.eyebrow) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {block.eyebrow && <span className="hs-eyebrow" style={{ color: 'var(--color-primary)' }}>{block.eyebrow}</span>}
                  {block.title && (
                    <h2 className="hs-serif">
                      <Accent text={block.title} />
                    </h2>
                  )}
                  {block.body && <p className="hs-band-body">{block.body}</p>}
                  {block.button && (
                    <a {...linkProps(block.button)} className="hs-btn hs-btn-primary" style={{ alignSelf: 'flex-start' }}>
                      {block.button.label}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </a>
                  )}
                </div>
              )}
              {block.contact && (
                <div className="hs-contact">
                  {block.contact.title && (
                    <span className="hs-serif" style={{ fontSize: '1.4rem', marginBottom: 10 }}>
                      {block.contact.title}
                    </span>
                  )}
                  {block.contact.address &&
                    (block.contact.mapsHref ? (
                      <a href={block.contact.mapsHref} target="_blank" rel="noopener noreferrer">
                        {block.contact.address}
                      </a>
                    ) : (
                      <span>{block.contact.address}</span>
                    ))}
                  {block.contact.hours.map((h, i) => (
                    <span key={i} className="hs-contact-muted">
                      {h}
                    </span>
                  ))}
                  {block.contact.phone && <a href={`tel:${block.contact.phone.replace(/[^\d+]/g, '')}`}>{block.contact.phone}</a>}
                  {block.contact.email && <a href={`mailto:${block.contact.email}`}>{block.contact.email}</a>}
                  {block.contact.links.length > 0 && (
                    <div className="hs-socials">
                      {block.contact.links.map((l) => (
                        <a key={l.href} {...linkProps(l)}>
                          {l.label}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )
    case 'inquiry':
      if (block.hero)
        return (
          <section id={block.anchor ?? undefined} className="hs-section hs-inquiry-hero">
            <div className="hs-split" style={{ alignItems: 'center' }}>
              <div className="hs-stack">
                {block.eyebrow && <span className="hs-eyebrow">{block.eyebrow}</span>}
                {block.title && (
                  <h1 className="hs-h2 hs-display">
                    <Accent text={block.title} />
                  </h1>
                )}
                {block.body.map((p, i) => (
                  <p key={i} className="hs-lead" style={{ fontSize: '1.15rem', lineHeight: 1.7 }}>
                    {p}
                  </p>
                ))}
              </div>
              <ContactFormBlock {...block.form} variant="house" />
            </div>
          </section>
        )
      return (
        <section id={block.anchor ?? undefined} className={`hs-section${top}`}>
          <div className="hs-split" style={{ alignItems: 'start' }}>
            <div className="hs-stack">
              <Heading eyebrow={block.eyebrow} title={block.title} />
              {block.body.map((p, i) => (
                <p key={i} className="hs-lead">
                  {p}
                </p>
              ))}
            </div>
            <ContactFormBlock {...block.form} variant="house" />
          </div>
        </section>
      )
    case 'other':
      return <div className="hs-plain">{block.node}</div>
  }
}
