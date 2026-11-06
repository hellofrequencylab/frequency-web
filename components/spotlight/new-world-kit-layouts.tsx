import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Input } from '@/components/ui/field'
import {
  ArrowRight, Award, Check, Briefcase, CalendarDays, Car, ChartColumn, Clock, Droplet, Eye, Heart, House, Leaf, Mail, MapPin, MessageCircle,
  Phone, ShieldCheck, Sparkles, Star, Sun, Tag, User, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import { NEW_WORLD_DAY_CSS, NEW_WORLD_TOKENS_CSS } from '@/lib/theme/new-world'
import { NEW_WORLD_ACCENT_CSS, NEW_WORLD_KIT_LAYOUTS_CSS } from './new-world-kit-layouts-css'
import type { NewWorldLayoutKey, NewWorldSpotlightContent } from '@/lib/spotlight/new-world-kit-content'

// THE NEW WORLD KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of the design's Spotlight Layouts page (Stack,
// Card wall, Story, Calendar first, Shop front, Profile). Server Component, no hooks. Reads NewWorldSpotlightContent
// (lib/spotlight/new-world-kit-content.ts) and the theme's --nw-* tokens only: the root carries data-house-theme="new-world",
// the register (data-th) and the accent (data-accent), and the styles read var(--nw-*). Display type is the design's
// default voice (mixed case, the accent face for the em). Filled accent buttons carry the theme's on-accent label, white by
// the owner's rule. Photos are the owner's or the theme's gradient surface; nothing is invented. Registered with New World's
// Spotlight wiring (LIVE-2057), which maps a stored `new-world-kit:<name>` id to a layout here.

type C = NewWorldSpotlightContent
type Icon = C['doors'][number]['icon']

export type NewWorldKitLayoutId = `new-world-kit:${NewWorldLayoutKey}`

/** The layouts, in the design's order, with the design's own words for what each is for. */
export const NEW_WORLD_KIT_LAYOUTS: readonly { id: NewWorldKitLayoutId; label: string; blurb: string }[] = [
  { id: 'new-world-kit:stack', label: 'Stack', blurb: 'Every way in, stacked' },
  { id: 'new-world-kit:card-wall', label: 'Card wall', blurb: 'Two columns of cards' },
  { id: 'new-world-kit:story', label: 'Story', blurb: 'One photo, a few lines, one button' },
  { id: 'new-world-kit:calendar-first', label: 'Calendar first', blurb: 'Open times lead' },
  { id: 'new-world-kit:shop-front', label: 'Shop front', blurb: 'Services as products' },
  { id: 'new-world-kit:profile', label: 'Profile', blurb: 'The owner first' },
]

const ICONS: Record<Icon, LucideIcon> = {
  message: MessageCircle, sparkle: Sparkles, calendar: CalendarDays, shield: ShieldCheck, star: Star, award: Award, wrench: Wrench,
  home: House, clock: Clock, leaf: Leaf, heart: Heart, chart: ChartColumn, briefcase: Briefcase, tag: Tag, bolt: Zap, car: Car,
  droplet: Droplet, check: Check, users: Users, sun: Sun, user: User, mail: Mail, eye: Eye, pin: MapPin,
}

function Tile({ icon, size = 36 }: { icon: Icon; size?: number }) {
  const I = ICONS[icon]
  return <span className="nws-tile" style={{ width: size, height: size }} aria-hidden><I size={Math.round(size * 0.45)} strokeWidth={2} /></span>
}
const Eyebrow = ({ children, accent }: { children: ReactNode; accent?: boolean }) => <div className={`nws-eb${accent ? ' nws-eb--accent' : ''}`}>{children}</div>
function Display({ title, em, size, className = '' }: { title: string; em: string; size: number; className?: string }) {
  return <div className={`nws-d ${className}`} style={{ fontSize: size }}>{title} <em>{em}</em></div>
}
function Btn({ href, children, tone = 'accent', size = 'lg' }: { href: string; children: ReactNode; tone?: 'accent' | 'secondary' | 'primary'; size?: 'lg' | 'sm' }) {
  const t = tone === 'primary' ? '' : ` nws-btn--${tone}`
  return <Link href={href} className={`nws-btn${t} nws-btn--${size}`}>{children}</Link>
}
function Name({ c, size = 24 }: { c: C; size?: number }) {
  return <div className="nws-name"><span className="nws-mark" style={{ width: 40, height: 40 }} aria-hidden>{c.name.charAt(0)}</span><span style={{ fontSize: size }}>{c.name}</span></div>
}
function Socials({ size }: { size: number }) {
  return <div className="nws-socials">{[Phone, MessageCircle, Mail].map((I, i) => <span key={i} className="nws-iconbtn" style={{ width: size * 2.6, height: size * 2.6 }}><I size={size} aria-hidden /></span>)}</div>
}
function Foot() {
  return <div className="nws-foot"><i role="separator" /><div className="nws-mono">Spotlight on Frequency</div></div>
}
function Letter({ c, compact }: { c: C; compact?: boolean }) {
  if (!c.letter) return null
  return (
    <div className="nws-card nws-letter">
      <Display title={c.letter.title} em={c.letter.em} size={compact ? 20 : 24} />
      <p>{c.letter.body}</p>
      <form action={c.letter.action} method="get"><Input variant="seamless" className="nws-input" type="email" name="email" aria-label="Email" placeholder="you@email.com" required /><button className="nws-btn nws-btn--accent nws-btn--sm" type="submit">Join</button></form>
    </div>
  )
}
function Quote({ c }: { c: C }) {
  if (!c.quote) return null
  const words = c.quote.text.split(' ')
  return (
    <div className="nws-quote"><div>
      <div className="nws-d">“{words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em>”</div>
      <div className="nws-mono"><span>{c.quote.who}</span> · {c.quote.role}</div>
    </div></div>
  )
}
/** Five stars and the kit's one count (the design's Rating, TRUST[1]): sample only, so a live page shows none. */
function Rating({ c }: { c: C }) {
  if (!c.rating) return null
  return <div className="nws-rating"><span aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={12} fill="currentColor" strokeWidth={0} />)}</span>{c.rating}</div>
}
function Review({ r, c }: { r: NonNullable<C['review']>; c: C }) {
  return <div className="nws-card nws-review"><Rating c={c} /><p>“{r.q}”</p><div className="nws-mono"><span>{r.who}</span> · {r.what}</div></div>
}
function Photo({ c }: { c: C }) {
  return c.hero.photo ? <Image src={c.hero.photo} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectPosition: '70% 30%' }} /> : null
}
function Hero({ c, height }: { c: C; height: number }) {
  return (
    <section className="nws-hero" style={{ minHeight: height }} data-photo={c.hero.photo ? '' : undefined}>
      <Photo c={c} />
      <div className="nws-hero-top"><Name c={c} /></div>
      <div className="nws-hero-body">
        <Eyebrow>{c.hero.eyebrow}</Eyebrow>
        <h1 className="nws-d">{c.hero.title} <em>{c.hero.em}</em></h1>
        <Rating c={c} />
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
      </div>
    </section>
  )
}
function Door({ d }: { d: C['doors'][number] }) {
  return <Link href={d.href} className="nws-card nws-door"><Tile icon={d.icon} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowRight size={12} className="nws-sub" aria-hidden /></Link>
}

function Stack({ c }: { c: C }) {
  return (
    <>
      <Hero c={c} height={380} />
      <div className="nws-stack-list">{c.doors.map((d) => <Door key={d.id} d={d} />)}</div>
      {c.footerCta && <div className="nws-pad nws-closing" style={{ paddingTop: 20 }}><Btn href={c.footerCta.href}>{c.footerCta.label}<ArrowRight size={14} aria-hidden /></Btn></div>}
      {c.letter && <div className="nws-pad" style={{ paddingTop: 12 }}><Letter c={c} compact /></div>}
      <Foot />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  const f = c.featured
  return (
    <>
      <div className="nws-wall-head"><Name c={c} size={22} /><Display title={c.hero.title} em={c.hero.em} size={34} className="big" /><Rating c={c} /></div>
      <div className="nws-grid">
        <div className="nws-card nws-sq nws-wide">
          <Eyebrow accent>{f.eyebrow}</Eyebrow>
          <div><div className="nws-d">{f.title}</div><small>{f.meta}</small></div>
          <div><Btn href={f.href} size="sm">{f.cta}</Btn></div>
        </div>
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.id} href={d.href} className="nws-card nws-sq"><Tile icon={d.icon} size={34} /><div><b>{d.title}</b><small>{d.meta}</small></div></Link>
        ))}
        {c.letter && <div className="nws-span"><Letter c={c} compact /></div>}
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  return (
    <>
      <div className="nws-story-photo" data-photo={c.hero.photo ? '' : undefined}>
        <Photo c={c} />
        <div className="nws-story-name"><Name c={c} /></div>
        <div className="nws-story-text"><Eyebrow>{c.hero.eyebrow}</Eyebrow><h1 className="nws-d">{c.hero.title} <em>{c.hero.em}</em></h1></div>
      </div>
      <div className="nws-story-body">
        <p>{c.hero.body}</p>
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
        <div className="nws-links">{c.offers.map((o) => <Link key={o.name} href="/services">{o.name}</Link>)}</div>
      </div>
      <Quote c={c} />
      <Foot />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  return (
    <>
      <div className="nws-row-head"><Name c={c} size={20} /><Socials size={12} /></div>
      <div className="nws-lead"><Eyebrow>Book online</Eyebrow><Display title={c.headings.openings.title} em={c.headings.openings.em} size={34} /></div>
      <div className="nws-pad" style={{ paddingTop: 14 }}>
        {c.openings.map((o, i) => (
          <Link key={o.day} href={c.featured.href} className="nws-date">
            <div className={`nws-day${i === 0 ? ' nws-day--first' : ''}`}><span className="nws-mono">{o.mon}</span><b>{o.day}</b></div>
            <div><b className="t">{o.title}</b><small>{o.time} · {o.where}</small></div>
            {o.left ? <span className="nws-badge">{o.left} left</span> : <span className="nws-mono">Waitlist</span>}
          </Link>
        ))}
      </div>
      <div className="nws-pad nws-stackbtns" style={{ paddingTop: 12 }}>
        <Btn href={c.featured.href}>{c.featured.cta}</Btn>
        <Btn href="/book" tone="secondary">{c.secondaryCta}</Btn>
      </div>
      {c.offers.length > 0 && (
        <div className="nws-pad" style={{ paddingTop: 22 }}>
          <Eyebrow>Services</Eyebrow>
          <div className="nws-chips">{c.offers.map((o) => { const I = ICONS[o.icon]; return <Link key={o.name} href="/services" className="nws-chip"><I size={13} aria-hidden />{o.name}</Link> })}</div>
        </div>
      )}
      <Foot />
    </>
  )
}

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <div className="nws-row-head"><Name c={c} size={20} /><Tag size={18} className="nws-sub" aria-hidden /></div>
      <div className="nws-lead"><Eyebrow>Services &amp; pricing</Eyebrow><Display title={c.headings.services.title} em={c.headings.services.em} size={34} /></div>
      <div className="nws-grid">
        {c.offers.map((s, i) => (
          <div key={s.name} className={`nws-card nws-prod${i === 1 ? ' nws-prod--first' : ''}`}>
            <div className="nws-prod-photo"><Tile icon={s.icon} size={44} /></div>
            <div className="nws-prod-body">
              <b>{s.name}</b><small>{s.dur}</small>
              <footer><span className="nws-mono">{s.price}</span><Btn href={c.cta.href} size="sm" tone={i === 1 ? 'accent' : 'secondary'}>Book</Btn></footer>
            </div>
          </div>
        ))}
        {c.proof && (
          <div className="nws-card nws-proof nws-span"><div><Eyebrow accent>{c.proof.label}</Eyebrow><b>{c.proof.sub}</b></div><Tile icon={c.proof.icon} size={36} /></div>
        )}
      </div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  const page = c.linkPage
  const doors = page ? c.doors : c.doors.slice(0, 3)
  return (
    <>
      <div className={`nws-profile-head${page?.cover ? ' nws-profile-head--cover' : ''}`}>
        {page?.cover && <Image src={page.cover} alt="" fill sizes="(min-width: 640px) 576px, 100vw" className="nws-profile-cover" priority />}
        <div className="nws-portrait">
          {page?.portrait ? <Image src={page.portrait} alt={c.owner} width={112} height={112} className="nws-portrait-img" priority /> : <span aria-hidden>{c.owner.charAt(0)}</span>}
        </div>
        <div className="nws-d nws-profile-name">{c.owner}</div>
        {c.role && <Eyebrow>{page ? c.role : `${c.role} · ${c.name}`}</Eyebrow>}
        {c.story && <p>{c.story}</p>}
        {!page && <Socials size={14} />}
      </div>
      {c.cta.href && <div className="nws-pad" style={{ paddingTop: 22 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>}
      {c.secondReview && <div className="nws-pad" style={{ paddingTop: 22 }}><Review r={c.secondReview} c={c} /></div>}
      {doors.length > 0 && (
        <div className="nws-pad" style={{ paddingTop: 22 }}>
          {!page && <Eyebrow>Where to start</Eyebrow>}
          <div className="nws-card nws-list">
            {doors.map((d) => (
              <Link key={d.id} href={d.href}><Tile icon={d.icon} size={32} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowRight size={12} className="nws-sub" aria-hidden /></Link>
            ))}
          </div>
        </div>
      )}
      {!page && <Foot />}
    </>
  )
}

/** The registry: a stored layout key to the component that draws it. */
const LAYOUT_COMPONENT: Record<NewWorldLayoutKey, (p: { c: C }) => ReactNode> = {
  stack: Stack, 'card-wall': CardWall, story: Story, 'calendar-first': CalendarFirst, 'shop-front': ShopFront, profile: Profile,
}

/** One New World Spotlight layout, wearing the owner's accent and register. The `<style>` carries the theme's tokens and
 *  the layout sheet, so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function NewWorldKitSpotlightLayout({ layout, content, register = 'night', className }: { layout: NewWorldKitLayoutId; content: NewWorldSpotlightContent; register?: 'night' | 'day'; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout.slice('new-world-kit:'.length) as NewWorldLayoutKey]
  if (!Layout) return null
  return (
    <div data-house-theme="new-world" data-th={register} data-accent={content.accent} data-layout={layout} className={`nws${className ? ` ${className}` : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: NEW_WORLD_TOKENS_CSS + NEW_WORLD_DAY_CSS + NEW_WORLD_ACCENT_CSS + NEW_WORLD_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
