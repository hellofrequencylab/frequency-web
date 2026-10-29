import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Camera, Mail, Play, ShoppingBag } from 'lucide-react'
import { Input } from '@/components/ui/field'
import { TEMPLE_KIT_TOKENS_CSS, TEMPLE_KIT_VARIANTS_CSS } from '@/lib/theme/temple-kit'
import { TEMPLE_KIT_LAYOUTS_CSS } from './temple-kit-layouts-css'
import type { TempleKitLayoutId } from '@/lib/spotlight/layouts'
import type { TempleKitSpotlightContent } from '@/lib/spotlight/temple-kit-content'

// THE TEMPLE THEME KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of the design's Spotlight Layouts board (Stack, Card
// wall, Story, Calendar first, Shop front, Profile), selected by SpotlightTheme.layout through the registry in
// lib/spotlight/layouts.ts. Server Component, no hooks. Reads TempleKitSpotlightContent (lib/spotlight/temple-kit-content.ts)
// and the kit's tokens only: the root carries data-house-theme="temple-kit" and the profile (data-kit), the styles read var(--*).
// Pages: arch-niche seals, 16px cards, Marcellus headlines with one accent-coloured phrase, small uppercase Jost labels.

type C = TempleKitSpotlightContent
type DoorKey = C['doors'][number]['key']

/** The design's sigils (the baseline set the Seal draws): a ring with a mark inside. The shop door uses a bag. */
const SIGIL: Record<Exclude<DoorKey, 'sell'>, ReactNode> = {
  book: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1.2" /></>,
  learn: <><circle cx="12" cy="12" r="8" /><path d="M12 4A8 8 0 0 1 12 20A4.5 8 0 0 0 12 4Z" fill="currentColor" /></>,
  gather: <path d="M12 4L20 18H4Z" />,
  belong: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></>,
  publish: <><circle cx="12" cy="12" r="8" /><path d="M12 4A8 8 0 0 1 12 20Z" fill="currentColor" /></>,
}

function Glyph({ k, size }: { k: DoorKey; size: number }) {
  if (k === 'sell') return <ShoppingBag size={size} strokeWidth={1.5} aria-hidden />
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{SIGIL[k]}</svg>
}

function Display({ title, em, size, className = '', style }: { title: string; em: string; size: number; className?: string; style?: CSSProperties }) {
  return <div className={`tks-d ${className}`} style={{ fontSize: size, lineHeight: size >= 28 ? 1.05 : 1.15, ...style }}>{title}{em ? <> <em>{em}</em></> : null}</div>
}
const Eyebrow = ({ children, tone }: { children: ReactNode; tone?: 'media' | 'ink' | 'accent' }) => <div className={`tks-eb${tone ? ` tks-eb--${tone}` : ''}`}>{children}</div>
const Seal = ({ k, size }: { k: DoorKey; size: number }) => <span className="tks-seal" style={{ width: size, height: Math.round(size * 1.12) }}><Glyph k={k} size={Math.round(size * 0.4)} /></span>
const Btn = ({ href, children, size, tone }: { href: string; children: ReactNode; size?: 'lg' | 'sm'; tone?: 'secondary' | 'inverse' }) => (
  <Link href={href} className={`tks-btn${size ? ` tks-btn--${size}` : ''}${tone ? ` tks-btn--${tone}` : ''}`}>{children}</Link>
)
function Mark({ size }: { size: number }) {
  return <span className="tks-mark" style={{ width: size, height: Math.round(size * 1.14) }} aria-hidden><Glyph k="learn" size={Math.round(size * 0.42)} /></span>
}
function Name({ c, size = 26, media }: { c: C; size?: number; media?: boolean }) {
  return <div className={`tks-name${media ? ' tks-name--media' : ''}`}><Mark size={40} /><span style={{ fontSize: size }}>{c.name}</span></div>
}
function Socials({ size }: { size: number }) {
  return <div className="tks-socials">{[Camera, Play, Mail].map((I, i) => <span key={i} className="tks-iconbtn" style={{ width: size * 2.4, height: size * 2.4 }}><I size={size} aria-hidden /></span>)}</div>
}
function Foot() {
  return <div className="tks-foot tks-foot--tight"><div className="tks-orn" role="separator"><i /></div><small>Spotlight on Frequency</small></div>
}
function Letter({ c, compact }: { c: C; compact?: boolean }) {
  if (!c.letter) return null
  return (
    <div className="tks-letter">
      <Display title={c.letter.title} em={c.letter.em} size={compact ? 18 : 21} />
      <form action={c.letter.action} method="get">
        <label className="tks-field"><span className="tks-eb">Email</span><Input className="tks-input" type="email" name="email" placeholder="you@email.com" required /></label>
        <button className="tks-btn tks-btn--sm" type="submit">Join</button>
      </form>
    </div>
  )
}
function Quote({ c }: { c: C }) {
  if (!c.quote) return null
  return <div className="tks-quote"><div><p className="tks-d">“{c.quote.text}”</p><div style={{ marginTop: 10 }}><Eyebrow><span style={{ color: 'var(--color-text)' }}>{c.quote.who}</span> · {c.quote.role}</Eyebrow></div></div></div>
}
function Photo({ src, pos }: { src: string; pos: string }) {
  return <Image src={src} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectPosition: pos }} />
}
function Hero({ c, height }: { c: C; height: number }) {
  return (
    <section className="tks-hero tks-grain" style={{ height }}>
      <Photo src={c.hero.photo} pos={c.hero.pos} />
      <div className="tks-hero-top"><Name c={c} media /></div>
      <div className="tks-hero-body">
        <Eyebrow tone="media">{c.hero.eyebrow}</Eyebrow>
        <h1 className="tks-d">{c.hero.title}{c.hero.em ? <> <em>{c.hero.em}</em></> : null}</h1>
        <div style={{ marginTop: 22 }}><Btn href={c.cta.href} size="lg">{c.cta.label}</Btn></div>
      </div>
    </section>
  )
}

function Stack({ c }: { c: C }) {
  return (
    <>
      <Hero c={c} height={380} />
      <div className="tks-stack-list">
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.key} href={d.href} className="tks-door"><Seal k={d.key} size={36} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowUpRight size={14} className="tks-subtle" aria-hidden /></Link>
        ))}
      </div>
      {c.letter && <div className="tks-pad" style={{ paddingTop: 14 }}><Letter c={c} compact /></div>}
      <Foot />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  const f = c.featured
  return (
    <>
      <div className="tks-wall-head"><Name c={c} size={22} /><Display title={c.hero.title} em={c.hero.em} size={26} style={{ lineHeight: 1.05 }} /><Eyebrow>{c.descriptor}</Eyebrow></div>
      <div className="tks-grid">
        <div className="tks-card tks-card--wide">
          <Eyebrow tone="ink">{f.eyebrow}</Eyebrow>
          <div><b className="tks-d">{f.title}</b><small>{f.meta}</small></div>
          <div><Btn href={f.href} size="sm" tone="inverse">{f.cta}</Btn></div>
        </div>
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.key} href={d.href} className="tks-card"><Seal k={d.key} size={36} /><div><b>{d.title}</b><small>{d.meta}</small></div></Link>
        ))}
        {c.letter && <div className="tks-card tks-card--auto"><Letter c={c} compact /></div>}
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  return (
    <>
      <div className="tks-story-photo tks-grain">
        <Photo src={c.hero.photo} pos={c.hero.pos} />
        <div className="tks-story-name"><Name c={c} media /></div>
        <div className="tks-story-text"><Eyebrow tone="media">{c.hero.eyebrow}</Eyebrow><h1 className="tks-d">{c.hero.title}{c.hero.em ? <> <em>{c.hero.em}</em></> : null}</h1></div>
      </div>
      <div className="tks-story-body">
        <p>{c.hero.body}</p>
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href} size="lg">{c.cta.label}</Btn></div>
        <div className="tks-links">{c.doors.slice(1, 4).map((d) => <Link key={d.key} href={d.href}>{d.title}</Link>)}</div>
      </div>
      <Quote c={c} />
      <Foot />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  return (
    <>
      <div className="tks-row-head"><Name c={c} size={22} /><Socials size={13} /></div>
      <div className="tks-pad" style={{ paddingTop: 22 }}><Eyebrow>Coming up</Eyebrow><div style={{ marginTop: 8 }}><Display title={c.gatherings.title} em={c.gatherings.em} size={28} /></div></div>
      <div className="tks-pad" style={{ paddingTop: 16 }}>
        {c.dates.slice(0, 3).map((w, i) => (
          <Link key={w.title + w.day} href={c.featured.href} className="tks-date">
            <div className={`tks-tile${i === 0 ? ' tks-tile--first' : ''}`}><div className="tks-eb">{w.mon}</div><b>{w.day}</b></div>
            <div><b className="t">{w.title}</b><small>{w.time} · {w.where}</small></div>
            {w.seatsLeft && w.seatsLeft <= 3 ? <span className="tks-badge">{w.seatsLeft} left</span> : <ArrowUpRight size={14} className="tks-subtle" aria-hidden />}
          </Link>
        ))}
      </div>
      <div className="tks-pad" style={{ paddingTop: 14 }}>
        <Btn href={c.featured.href} size="lg">Save a spot</Btn>
        <div style={{ marginTop: 10 }}><Btn href={c.cta.href} size="lg" tone="secondary">{c.cta.label}</Btn></div>
      </div>
      <div className="tks-pad" style={{ paddingTop: 20 }}>
        <Eyebrow>Also here</Eyebrow>
        <div className="tks-chips">{c.doors.map((d) => <Link key={d.key} href={d.href} className="tks-chip"><Glyph k={d.key} size={13} />{d.title}</Link>)}</div>
      </div>
      <Foot />
    </>
  )
}

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <div className="tks-row-head"><Name c={c} size={22} /><ShoppingBag size={18} aria-hidden /></div>
      <div className="tks-pad" style={{ paddingTop: 22 }}><Eyebrow>{c.offeringsLabel}</Eyebrow><div style={{ marginTop: 8 }}><Display title={c.offeringsHead.title} em={c.offeringsHead.em} size={28} /></div></div>
      <div className="tks-grid" style={{ paddingTop: 18 }}>
        {c.offerings.map((s, i) => (
          <div key={s.name} className={`tks-prod${i === 0 ? ' tks-prod--first' : ''}`}>
            <div className="tks-prod-img"><Photo src={s.photo} pos="50% 50%" /></div>
            <div><b>{s.name}</b><small>{s.minutes} min</small>
              <footer><span className="tks-price">{s.price === null ? 'Ask' : `$${s.price}`}</span><Btn href={c.cta.href} size="sm" tone={i === 0 ? undefined : 'secondary'}>Book</Btn></footer></div>
          </div>
        ))}
        {c.gift && <div className="tks-gift"><div><Eyebrow tone="accent">{c.gift.label}</Eyebrow><b>{c.gift.title}</b></div><Btn href={c.gift.href} size="sm" tone="secondary">{c.gift.cta}</Btn></div>}
      </div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  return (
    <>
      <div className="tks-profile-head">
        <div className="tks-portrait"><Image src={c.portrait} alt="" fill sizes="112px" /></div>
        <div className="tks-d tks-profile-name">{c.name}</div>
        <Eyebrow>{c.descriptor}</Eyebrow>
        <p>{c.hero.body}</p>
        <Socials size={14} />
      </div>
      <div className="tks-pad" style={{ paddingTop: 22 }}><Btn href={c.cta.href} size="lg">{c.cta.label}</Btn></div>
      <div className="tks-pad" style={{ paddingTop: 22 }}>
        <Eyebrow>Where to start</Eyebrow>
        <div className="tks-list">
          {c.doors.slice(0, 3).map((d) => <Link key={d.key} href={d.href}><Glyph k={d.key} size={18} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowUpRight size={14} className="tks-subtle" aria-hidden /></Link>)}
        </div>
      </div>
      <div style={{ marginTop: 22 }}><Quote c={c} /></div>
      <Foot />
    </>
  )
}

/** The registry: a stored layout id to the component that draws it. */
const LAYOUT_COMPONENT: Partial<Record<TempleKitLayoutId, (p: { c: C }) => ReactNode>> = {
  'temple-kit:stack': Stack,
  'temple-kit:card-wall': CardWall,
  'temple-kit:story': Story,
  'temple-kit:calendar-first': CalendarFirst,
  'temple-kit:shop-front': ShopFront,
  'temple-kit:profile': Profile,
}

/** One Temple Spotlight layout, wearing the profile's accent. The `<style>` carries the kit's tokens and the layout sheet,
 *  so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function TempleKitSpotlightLayout({ layout, content, className }: { layout: TempleKitLayoutId; content: TempleKitSpotlightContent; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout]
  if (!Layout) return null
  return (
    <div data-house-theme="temple-kit" data-kit={content.profile} data-layout={layout} className={`tks${className ? ` ${className}` : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: TEMPLE_KIT_TOKENS_CSS + TEMPLE_KIT_VARIANTS_CSS + TEMPLE_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
