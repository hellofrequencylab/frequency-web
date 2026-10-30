import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Input } from '@/components/ui/field'
import { ArrowUpRight, BookOpen, CalendarDays, Handshake, Camera, Mail, Play, Route, ShoppingBag, Users, type LucideIcon } from 'lucide-react'
import { NETWORK_KIT_SCHEMES, NETWORK_KIT_TOKENS_CSS } from '@/lib/theme/network-kit'
import { NETWORK_KIT_LAYOUTS_CSS } from './network-kit-layouts-css'
import type { NetworkKitLayoutId } from '@/lib/spotlight/layouts'
import type { NetworkKitSpotlightContent } from '@/lib/spotlight/network-kit-content'

// THE NETWORK THEME KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of the design's Spotlight Layouts page (Stack,
// Card wall, Story, Calendar first, Shop front, Profile), selected by SpotlightTheme.layout through the registry in
// lib/spotlight/layouts.ts. Server Component, no hooks. Reads NetworkKitSpotlightContent (lib/spotlight/network-kit-content.ts)
// and the kit's tokens only: the root carries data-house-theme="network-kit" and the scheme, the styles read var(--*).
// Pages: pill buttons, 28px cards, Bricolage headlines with one Instrument Serif italic word, an accent dot before every label.

type C = NetworkKitSpotlightContent
const DOOR_ICON: Record<C['doors'][number]['key'], LucideIcon> = {
  gather: CalendarDays, belong: Users, book: Handshake, learn: Route, sell: ShoppingBag, publish: BookOpen,
}

function Display({ title, em, size, className = '', style }: { title: string; em: string; size: number; className?: string; style?: CSSProperties }) {
  return <div className={`nks-d ${className}`} style={{ fontSize: size, lineHeight: size >= 28 ? 1.05 : 1.15, ...style }}>{title} <em>{em}</em></div>
}
const Eyebrow = ({ children, tone }: { children: ReactNode; tone?: 'media' | 'ink' | 'accent' | 'pill' }) => <div className={`nks-eb${tone ? ` nks-eb--${tone}` : ''}`}>{children}</div>
const Seal = ({ icon: I, size }: { icon: LucideIcon; size: number }) => <span className="nks-seal" style={{ width: size, height: size }}><I size={Math.round(size * 0.4)} strokeWidth={1.75} aria-hidden /></span>
const Btn = ({ href, children, size, tone }: { href: string; children: ReactNode; size?: 'lg' | 'sm'; tone?: 'secondary' | 'inverse' }) => (
  <Link href={href} className={`nks-btn${size ? ` nks-btn--${size}` : ''}${tone ? ` nks-btn--${tone}` : ''}`}>{children}</Link>
)
function Mark({ size }: { size: number }) { return <span className="nks-mark" style={{ width: size, height: size }} aria-hidden><Users size={Math.round(size * 0.46)} strokeWidth={2} /></span> }
function Name({ c, size = 26, media }: { c: C; size?: number; media?: boolean }) {
  return <div className={`nks-name${media ? ' nks-name--media' : ''}`}><Mark size={40} /><span style={{ fontSize: size }}>{c.name}</span></div>
}
function Socials({ size }: { size: number }) {
  return <div className="nks-socials">{[Camera, Play, Mail].map((I, i) => <span key={i} className="nks-iconbtn" style={{ width: size * 2.4, height: size * 2.4 }}><I size={size} aria-hidden /></span>)}</div>
}
function Foot() {
  return <div className="nks-foot nks-foot--tight"><div className="nks-orn" role="separator"><i /></div><small>Powered by Frequency</small></div>
}
function Letter({ c, compact }: { c: C; compact?: boolean }) {
  if (!c.letter) return null
  return (
    <div className="nks-letter">
      <Display title={c.letter.title} em={c.letter.em} size={compact ? 18 : 21} />
      <form action={c.letter.action} method="get"><Input variant="seamless" className="nks-input" type="email" name="email" aria-label="Email" placeholder="you@email.com" required /><button className="nks-btn nks-btn--sm" type="submit">Join</button></form>
    </div>
  )
}
function Quote({ c }: { c: C }) {
  if (!c.quote) return null
  return <div className="nks-quote"><div><p className="nks-d">“{c.quote.text}”</p><div style={{ marginTop: 10 }}><Eyebrow><span style={{ color: 'var(--color-text)' }}>{c.quote.who}</span> · {c.quote.role}</Eyebrow></div></div></div>
}
function Photo({ src, pos }: { src: string; pos: string }) {
  return <Image src={src} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectPosition: pos }} />
}
function Hero({ c, height }: { c: C; height: number }) {
  return (
    <section className="nks-hero" style={{ height }}>
      <Photo src={c.hero.photo} pos={c.hero.pos} />
      <div className="nks-hero-top"><Name c={c} media /></div>
      <div className="nks-hero-body">
        <Eyebrow tone="pill">{c.hero.eyebrow}</Eyebrow>
        <h1 className="nks-d">{c.hero.title} <em>{c.hero.em}</em></h1>
        <div style={{ marginTop: 22 }}><Btn href={c.cta.href} size="lg">{c.cta.label}</Btn></div>
      </div>
    </section>
  )
}

function Stack({ c }: { c: C }) {
  return (
    <>
      <Hero c={c} height={380} />
      <div className="nks-stack-list">
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.key} href={d.href} className="nks-door"><Seal icon={DOOR_ICON[d.key]} size={36} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowUpRight size={14} className="nks-subtle" aria-hidden /></Link>
        ))}
      </div>
      {c.letter && <div className="nks-pad" style={{ paddingTop: 14 }}><Letter c={c} compact /></div>}
      <Foot />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  const f = c.featured
  return (
    <>
      <div className="nks-wall-head"><Name c={c} size={22} /><Display title={c.hero.title} em={c.hero.em} size={26} style={{ lineHeight: 1.05 }} /><Eyebrow>{c.descriptor}</Eyebrow></div>
      <div className="nks-grid">
        <div className="nks-card nks-card--wide" style={{ aspectRatio: '2.6 / 1' }}>
          <Eyebrow tone="ink">{f.eyebrow}</Eyebrow>
          <div><b className="nks-d">{f.title}</b><small>{f.meta}</small></div>
          <div><Btn href={f.href} size="sm" tone="inverse">{f.cta}</Btn></div>
        </div>
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.key} href={d.href} className="nks-card"><Seal icon={DOOR_ICON[d.key]} size={36} /><div><b>{d.title}</b><small>{d.meta}</small></div></Link>
        ))}
        {c.letter && <div className="nks-card nks-card--auto" style={{ padding: 0, background: 'transparent', boxShadow: 'none' }}><Letter c={c} compact /></div>}
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  return (
    <>
      <div className="nks-story-photo">
        <Photo src={c.hero.photo} pos={c.hero.pos} />
        <div className="nks-story-name"><Name c={c} media /></div>
        <div className="nks-story-text"><Eyebrow tone="media">{c.hero.eyebrow}</Eyebrow><h1 className="nks-d">{c.hero.title} <em>{c.hero.em}</em></h1></div>
      </div>
      <div className="nks-story-body">
        <p>{c.hero.body}</p>
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href} size="lg">{c.cta.label}</Btn></div>
        <div className="nks-links">{c.doors.slice(1, 4).map((d) => <Link key={d.key} href={d.href}>{d.title}</Link>)}</div>
      </div>
      <Quote c={c} />
      <Foot />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  return (
    <>
      <div className="nks-row-head"><Name c={c} size={22} /><Socials size={13} /></div>
      <div className="nks-pad" style={{ paddingTop: 22 }}><Eyebrow>Coming up</Eyebrow><div style={{ marginTop: 8 }}><Display title={c.gatherings.title} em={c.gatherings.em} size={28} /></div></div>
      <div className="nks-pad" style={{ paddingTop: 16 }}>
        {c.dates.slice(0, 3).map((w, i) => (
          <Link key={w.title + w.day} href={c.featured.href} className="nks-date">
            <div className={`nks-tile${i === 0 ? ' nks-tile--first' : ''}`}><div className="nks-eb">{w.mon}</div><b>{w.day}</b></div>
            <div><b className="t">{w.title}</b><small>{w.time} · {w.where}</small></div>
            {w.seatsLeft && w.seatsLeft <= 3 ? <span className="nks-badge">{w.seatsLeft} left</span> : <ArrowUpRight size={14} className="nks-subtle" aria-hidden />}
          </Link>
        ))}
      </div>
      <div className="nks-pad" style={{ paddingTop: 14 }}>
        <Btn href={c.featured.href} size="lg">Save a spot</Btn>
        <div style={{ marginTop: 10 }}><Btn href={c.cta.href} size="lg" tone="secondary">{c.cta.label}</Btn></div>
      </div>
      <div className="nks-pad" style={{ paddingTop: 20 }}>
        <Eyebrow>Also here</Eyebrow>
        <div className="nks-chips">{c.doors.map((d) => { const I = DOOR_ICON[d.key]; return <Link key={d.key} href={d.href} className="nks-chip"><I size={13} aria-hidden />{d.title}</Link> })}</div>
      </div>
      <Foot />
    </>
  )
}

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <div className="nks-row-head"><Name c={c} size={22} /><ShoppingBag size={18} aria-hidden /></div>
      <div className="nks-pad" style={{ paddingTop: 22 }}><Eyebrow>{c.offeringsLabel}</Eyebrow><div style={{ marginTop: 8 }}><Display title={c.offeringsHead.title} em={c.offeringsHead.em} size={28} /></div></div>
      <div className="nks-grid" style={{ paddingTop: 18 }}>
        {c.offerings.map((s, i) => (
          <div key={s.name} className={`nks-prod${i === 0 ? ' nks-prod--first' : ''}`}>
            <div style={{ position: 'relative', aspectRatio: i === 0 ? '16 / 5' : '1' }}><Photo src={s.photo} pos="50% 40%" /></div>
            <div><b>{s.name}</b><small>{s.minutes} min</small>
              <footer><span className="nks-price">{s.price === 0 ? 'Free' : `$${s.price}`}</span><Btn href={c.cta.href} size="sm" tone={i === 0 ? undefined : 'secondary'}>Book</Btn></footer></div>
          </div>
        ))}
        {c.offerings.length > 0 && (
          <div className="nks-gift"><div><Eyebrow tone="accent">Gift a membership</Eyebrow><b>Give someone a seat at the table</b></div><Btn href="/membership" size="sm" tone="secondary">Choose</Btn></div>
        )}
      </div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  return (
    <>
      <div className="nks-profile-head">
        <div className="nks-portrait" style={{ position: 'relative' }}><Image src={c.hero.photo.replace(/photo-\d+/, 'photo-04')} alt="" fill sizes="112px" style={{ objectPosition: '45% 26%' }} /></div>
        <div className="nks-d nks-profile-name">{c.name}</div>
        <Eyebrow>{c.descriptor}</Eyebrow>
        <p>{c.hero.body}</p>
        <Socials size={14} />
      </div>
      <div className="nks-pad" style={{ paddingTop: 22 }}><Btn href={c.cta.href} size="lg">{c.cta.label}</Btn></div>
      <div className="nks-pad" style={{ paddingTop: 22 }}>
        <Eyebrow>Where to start</Eyebrow>
        <div className="nks-list">
          {c.doors.slice(0, 3).map((d) => { const I = DOOR_ICON[d.key]; return <Link key={d.key} href={d.href}><I size={18} aria-hidden /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowUpRight size={14} className="nks-subtle" aria-hidden /></Link> })}
        </div>
      </div>
      <div style={{ marginTop: 22 }}><Quote c={c} /></div>
      <Foot />
    </>
  )
}

/** The registry: a stored layout id to the component that draws it. */
const LAYOUT_COMPONENT: Record<NetworkKitLayoutId, (p: { c: C }) => ReactNode> = {
  'network-kit:stack': Stack,
  'network-kit:card-wall': CardWall,
  'network-kit:story': Story,
  'network-kit:calendar-first': CalendarFirst,
  'network-kit:shop-front': ShopFront,
  'network-kit:profile': Profile,
}

/** One Network Spotlight layout, wearing the profile's scheme. The `<style>` carries the kit's tokens and the layout
 *  sheet, so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function NetworkKitSpotlightLayout({ layout, content, className }: { layout: NetworkKitLayoutId; content: NetworkKitSpotlightContent; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout]
  if (!Layout) return null
  const scheme = NETWORK_KIT_SCHEMES[content.scheme]
  return (
    <div data-house-theme="network-kit" data-scheme={content.scheme} data-layout={layout} data-scheme-label={scheme.label} className={`nks${className ? ` ${className}` : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: NETWORK_KIT_TOKENS_CSS + NETWORK_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
