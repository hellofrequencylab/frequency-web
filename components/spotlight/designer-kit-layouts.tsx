import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Input } from '@/components/ui/field'
import { ArrowUpRight, Camera, Mail, Play, ShoppingBag } from 'lucide-react'
import { DESIGNER_TOKENS_CSS } from '@/lib/theme/designer'
import { DESIGNER_KIT_LAYOUTS_CSS, designerKitAccentCss } from './designer-kit-layouts-css'
import type { DesignerKitLayoutId } from '@/lib/spotlight/layouts'
import type { DesignerKitSpotlightContent } from '@/lib/spotlight/designer-kit-content'

// THE DESIGNER THEME KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of the design's Spotlight Layouts page (Stack,
// Card wall, Story, Calendar first, Shop front, Profile), selected by SpotlightTheme.layout through the registry in
// lib/spotlight/layouts.ts. Server Component, no hooks. Reads DesignerKitSpotlightContent (lib/spotlight/designer-kit-content.ts)
// and the Designer tokens only: the root carries data-house-theme="designer" and the profile, the styles read var(--*).
// Pages: plaster ground, Cormorant headlines with one italic ending, tracked-caps labels, charcoal buttons, one accent per profile.

type C = DesignerKitSpotlightContent
type SigilPart = ['c', number, number, number] | ['p', string] | ['f', string] | ['r', number, number, number, number, number]
const C_ = (cx: number, cy: number, r: number): SigilPart => ['c', cx, cy, r]
// The design's own mark set (components/core/Sigil.jsx): monoline geometry on a 24px grid, drawn in currentColor.
const SIGILS: Record<string, SigilPart[]> = {
  circle: [C_(12, 12, 8)],
  ring: [C_(12, 12, 8), C_(12, 12, 4)],
  half: [C_(12, 12, 8), ['f', 'M12 4A8 8 0 0 1 12 20Z']],
  arc: [C_(12, 12, 8), ['f', 'M12 4A8 8 0 0 1 12 20A4.5 8 0 0 0 12 4Z']],
  target: [C_(12, 12, 8), C_(12, 12, 4.5), C_(12, 12, 1.2)],
  square: [['r', 5, 5, 14, 14, 1]],
  diamond: [['p', 'M12 4L20 12L12 20L4 12Z']],
  triangle: [['p', 'M12 4L20 18H4Z']],
  hexagon: [['p', 'M12 3.5L19.4 7.75V16.25L12 20.5L4.6 16.25V7.75Z']],
  lines: [['p', 'M4 8H20M4 12H20M4 16H20']],
  grid: [['r', 5, 5, 5.5, 5.5, 1], ['r', 13.5, 5, 5.5, 5.5, 1], ['r', 5, 13.5, 5.5, 5.5, 1], ['r', 13.5, 13.5, 5.5, 5.5, 1]],
  wave: [['p', 'M3 12C5.5 8 7.5 8 10 12C12.5 16 14.5 16 17 12C18.3 10 19.5 9 21 9']],
  spark: [['p', 'M12 3C12.8 9 15 11.2 21 12C15 12.8 12.8 15 12 21C11.2 15 9 12.8 3 12C9 11.2 11.2 9 12 3Z']],
  stack: [['p', 'M12 4L20 8.5L12 13L4 8.5Z'], ['p', 'M4 12.5L12 17L20 12.5M4 16.5L12 21L20 16.5']],
  nodes: [C_(6, 7, 2), C_(18, 7, 2), C_(12, 18, 2), ['p', 'M8 7H16M7 8.6L11 16M17 8.6L13 16']],
}
function Sigil({ name, size }: { name: string; size: number }) {
  const parts = SIGILS[name] ?? SIGILS.circle!
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, overflow: 'visible' }}>
      {parts.map((s, i) => s[0] === 'c' ? <circle key={i} cx={s[1]} cy={s[2]} r={s[3]} /> : s[0] === 'r' ? <rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} /> : s[0] === 'f' ? <path key={i} d={s[1]} fill="currentColor" stroke="none" /> : <path key={i} d={s[1]} />)}
    </svg>
  )
}

// One mark per way in, as the design's surfaceDoors draws them.
const DOOR_SIGIL: Record<C['doors'][number]['key'], string | null> = { book: 'target', learn: 'arc', gather: 'triangle', belong: 'ring', sell: null, publish: 'half' }
function DoorGlyph({ k, size }: { k: C['doors'][number]['key']; size: number }) {
  const s = DOOR_SIGIL[k]
  return s ? <Sigil name={s} size={size} /> : <ShoppingBag size={size} strokeWidth={1.5} aria-hidden />
}

const Eyebrow = ({ children, tone, tiny }: { children: ReactNode; tone?: 'hero' | 'media' | 'ink'; tiny?: boolean }) => <span className={`dzs-eb${tone ? ` dzs-eb--${tone}` : ''}${tiny ? ' dzs-eb--tiny' : ''}`}>{children}</span>
const Seal = ({ k, size }: { k: C['doors'][number]['key']; size: number }) => <span className="dzs-seal" style={{ width: size, height: size }}><DoorGlyph k={k} size={Math.round(size * 0.38)} /></span>
const Btn = ({ href, children, size, tone, arrow }: { href: string; children: ReactNode; size?: 'lg' | 'sm'; tone?: 'secondary' | 'inverse' | 'ink'; arrow?: boolean }) => (
  <Link href={href} className={`dzs-btn${size ? ` dzs-btn--${size}` : ''}${tone ? ` dzs-btn--${tone}` : ''}`}>{children}{arrow && <span aria-hidden>→</span>}</Link>
)
function Display({ title, em, size, className = '', style }: { title: string; em: string; size?: number; className?: string; style?: CSSProperties }) {
  return <div className={`dzs-d ${className}`} style={{ fontSize: size, ...style }}>{title} <em>{em}</em></div>
}
function Mark({ c, size }: { c: C; size: number }) { return <span className="dzs-mark" style={{ width: size, height: size }} aria-hidden><Sigil name={c.sigil} size={Math.round(size * 0.42)} /></span> }
function Name({ c, size = 26, media }: { c: C; size?: number; media?: boolean }) {
  return <div className={`dzs-name${media ? ' dzs-name--media' : ''}`}><Mark c={c} size={40} /><span style={{ fontSize: size }}>{c.name}</span></div>
}
function Socials({ size }: { size: number }) {
  const box = Math.round(size * 2.4)
  return <div className="dzs-socials">{[Camera, Play, Mail].map((I, i) => <span key={i} className="dzs-iconbtn" style={{ width: box, height: box }}><I size={size} aria-hidden /></span>)}</div>
}
function Foot() {
  return <div className="dzs-foot"><div className="dzs-orn" role="separator"><i>+</i></div><small>Spotlight on Frequency</small></div>
}
function Letter({ c, compact }: { c: C; compact?: boolean }) {
  if (!c.letter) return null
  return (
    <div className="dzs-letter">
      <Display title={c.letter.title} em={c.letter.em} size={compact ? 18 : 21} />
      <form action={c.letter.action} method="get">
        <div className="dzs-field"><label htmlFor="dzs-email">Email</label><Input variant="seamless" id="dzs-email" className="dzs-input" type="email" name="email" placeholder="you@email.com" required /></div>
        <button className="dzs-btn dzs-btn--sm" type="submit">Join</button>
      </form>
    </div>
  )
}
function Quote({ c }: { c: C }) {
  if (!c.quote) return null
  return <div className="dzs-quote"><div><p className="dzs-d">“{c.quote.text}”</p><Eyebrow><b>{c.quote.who}</b> · {c.quote.role}</Eyebrow></div></div>
}
function Photo({ src, pos, sizes = '(max-width: 640px) 100vw, 576px' }: { src: string; pos?: string; sizes?: string }) {
  return <Image src={src} alt="" fill sizes={sizes} style={pos ? { objectPosition: pos } : undefined} />
}

function Hero({ c, height }: { c: C; height: number }) {
  return (
    <section className="dzs-hero" style={{ height }}>
      <Photo src={c.hero.photo} pos="50% 30%" />
      <div className="dzs-hero-top"><Name c={c} media /></div>
      <div className="dzs-hero-body">
        <Eyebrow tone="hero">{c.hero.eyebrow}</Eyebrow>
        <h1 className="dzs-d">{c.hero.title} <em>{c.hero.em}</em></h1>
        <Btn href={c.cta.href} size="lg" tone="inverse" arrow>{c.cta.label}</Btn>
      </div>
    </section>
  )
}

function Stack({ c }: { c: C }) {
  return (
    <>
      <Hero c={c} height={380} />
      <div className="dzs-stack-list">
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.key} href={d.href} className="dzs-door"><Seal k={d.key} size={36} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowUpRight size={14} className="dzs-subtle" aria-hidden /></Link>
        ))}
      </div>
      {c.letter && <div className="dzs-pad" style={{ paddingTop: 14 }}><Letter c={c} compact /></div>}
      <Foot />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  const f = c.featured
  return (
    <>
      <div className="dzs-wall-head"><Name c={c} size={22} /><Display title={c.hero.title} em={c.hero.em} size={26} style={{ lineHeight: 1.05 }} /><Eyebrow>{c.descriptor}</Eyebrow></div>
      <div className="dzs-grid">
        <div className="dzs-card dzs-card--wide">
          <Eyebrow tone="ink">{f.eyebrow}</Eyebrow>
          <div><b>{f.title}</b><small>{f.meta}</small></div>
          <Btn href={f.href} size="sm" tone="ink">{f.cta}</Btn>
        </div>
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.key} href={d.href} className="dzs-card"><Seal k={d.key} size={36} /><div><b>{d.title}</b><small>{d.meta}</small></div></Link>
        ))}
        {c.letter && <div className="dzs-card dzs-card--auto"><Display title={c.letter.title} em={c.letter.em} /><form action={c.letter.action} method="get"><div className="dzs-field"><label htmlFor="dzs-email">Email</label><Input variant="seamless" id="dzs-email" className="dzs-input" type="email" name="email" placeholder="you@email.com" required /></div><button className="dzs-btn dzs-btn--sm" type="submit">Join</button></form></div>}
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  return (
    <>
      <div className="dzs-story-photo">
        <Photo src={c.hero.photo} />
        <div className="dzs-story-name"><Name c={c} media /></div>
        <div className="dzs-story-text"><Eyebrow tone="media">{c.hero.eyebrow}</Eyebrow><h1 className="dzs-d">{c.hero.title} <em>{c.hero.em}</em></h1></div>
      </div>
      <div className="dzs-story-body">
        <p>{c.hero.body}</p>
        <Btn href={c.cta.href} size="lg">{c.cta.label}</Btn>
        <div className="dzs-links">{c.doors.filter((d) => d.key !== 'book').slice(0, 3).map((d) => <Link key={d.key} href={d.href}>{d.title}</Link>)}</div>
      </div>
      <Quote c={c} />
      <Foot />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  const gather = c.doors.find((d) => d.key === 'gather')
  return (
    <>
      <div className="dzs-row-head"><Name c={c} size={22} /><Socials size={13} /></div>
      <div className="dzs-intro"><Eyebrow>Coming up</Eyebrow><Display title={c.gatherings.title} em={c.gatherings.em} /></div>
      <div className="dzs-dates">
        {c.dates.slice(0, 3).map((w, i) => (
          <Link key={w.title + w.day} href={c.featured.href} className="dzs-date">
            <div className={`dzs-tile${i === 0 ? ' dzs-tile--first' : ''}`}><Eyebrow tiny>{w.mon}</Eyebrow><b>{w.day}</b></div>
            <div><b className="t">{w.title}</b><small>{w.time} · {w.where}</small></div>
            {w.seatsLeft ? <span className="dzs-badge">{w.seatsLeft} left</span> : <ArrowUpRight size={14} className="dzs-subtle" aria-hidden />}
          </Link>
        ))}
      </div>
      <div className="dzs-pad" style={{ paddingTop: 14 }}>
        <Btn href={gather?.href ?? c.featured.href} size="lg">{c.dates.length ? 'Save a spot' : (gather?.meta ?? 'See the next dates')}</Btn>
        <div style={{ marginTop: 10 }}><Btn href={c.cta.href} size="lg" tone="secondary">{c.cta.label}</Btn></div>
      </div>
      <div className="dzs-pad" style={{ paddingTop: 20 }}>
        <Eyebrow>Also here</Eyebrow>
        <div className="dzs-chips">{c.doors.filter((d) => d.key !== 'gather').map((d) => <Link key={d.key} href={d.href} className="dzs-chip"><DoorGlyph k={d.key} size={13} />{d.title}</Link>)}</div>
      </div>
      <Foot />
    </>
  )
}

const price = (n: number): string => (n === 0 ? 'Free' : `$${n}`)

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <div className="dzs-row-head"><Name c={c} size={22} /><ShoppingBag size={18} aria-hidden /></div>
      <div className="dzs-intro"><Eyebrow>{c.offeringsLabel}</Eyebrow><Display title={c.offeringsHead.title} em={c.offeringsHead.em} /></div>
      <div className="dzs-grid" style={{ paddingTop: 18 }}>
        {c.offerings.map((s, i) => (
          <div key={s.name} className={`dzs-prod${i === 0 ? ' dzs-prod--first' : ''}`}>
            <div className="dzs-prod-img"><Photo src={s.photo} pos="50% 50%" sizes={i === 0 ? '(max-width: 640px) 100vw, 576px' : '(max-width: 640px) 50vw, 288px'} /></div>
            <div className="dzs-prod-body"><b>{s.name}</b>{s.minutes != null && <small>{s.minutes} min</small>}
              <footer>{s.price != null ? <span className="dzs-price">{price(s.price)}</span> : <span />}<Btn href={c.cta.href} size="sm" tone={i === 0 ? undefined : 'secondary'}>Book</Btn></footer></div>
          </div>
        ))}
        {c.offerings.length > 0 && c.hasGift && (
          <div className="dzs-gift"><div><Eyebrow>Gift card</Eyebrow><b>Give someone a session</b></div><Btn href="/shop" size="sm" tone="secondary">Choose</Btn></div>
        )}
      </div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  return (
    <>
      <div className="dzs-profile-head">
        <div className="dzs-portrait"><Photo src={c.portrait} sizes="112px" /></div>
        <div className="dzs-d dzs-profile-name">{c.name}</div>
        <Eyebrow>{c.descriptor}</Eyebrow>
        <p>{c.hero.body}</p>
        <Socials size={14} />
      </div>
      <div className="dzs-pad" style={{ paddingTop: 22 }}><Btn href={c.cta.href} size="lg">{c.cta.label}</Btn></div>
      <div className="dzs-pad" style={{ paddingTop: 22 }}>
        <Eyebrow>Where to start</Eyebrow>
        <div className="dzs-list">
          {c.doors.slice(0, 3).map((d) => <Link key={d.key} href={d.href}><DoorGlyph k={d.key} size={18} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowUpRight size={14} className="dzs-subtle" aria-hidden /></Link>)}
        </div>
      </div>
      <div style={{ marginTop: 22 }}><Quote c={c} /></div>
      <Foot />
    </>
  )
}

/** The registry: a stored layout id to the component that draws it. */
const LAYOUT_COMPONENT: Record<DesignerKitLayoutId, (p: { c: C }) => ReactNode> = {
  'designer-kit:stack': Stack,
  'designer-kit:card-wall': CardWall,
  'designer-kit:story': Story,
  'designer-kit:calendar-first': CalendarFirst,
  'designer-kit:shop-front': ShopFront,
  'designer-kit:profile': Profile,
}

/** One Designer Spotlight layout, wearing the profile's accent. The `<style>` carries the theme's tokens, the profile's
 *  accent ramp and the layout sheet, so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function DesignerKitSpotlightLayout({ layout, content, className }: { layout: DesignerKitLayoutId; content: DesignerKitSpotlightContent; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout]
  if (!Layout) return null
  return (
    <div data-house-theme="designer" data-site-corners="subtle" data-profile={content.profile} data-layout={layout} className={`dzs${className ? ` ${className}` : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: DESIGNER_TOKENS_CSS + DESIGNER_KIT_LAYOUTS_CSS + designerKitAccentCss(content.profile, content.accent) }} />
      <div className="dzs-col"><Layout c={content} /></div>
    </div>
  )
}
