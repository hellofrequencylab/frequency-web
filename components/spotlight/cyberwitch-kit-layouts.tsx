import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Input } from '@/components/ui/field'
import {
  ArrowRight, Award, Check, Briefcase, CalendarDays, Car, ChartColumn, Clock, Droplet, Eye, Heart, House, Leaf, Mail, MapPin, MessageCircle,
  Phone, ShieldCheck, Sparkles, Star, Sun, Tag, User, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import { CYBERWITCH_ACCENT_CSS, CYBERWITCH_DIALS_CSS, CYBERWITCH_TOKENS_CSS } from '@/lib/theme/cyberwitch'
import { CYBERWITCH_KIT_LAYOUTS_CSS } from './cyberwitch-kit-layouts-css'
import type { CyberWitchLayoutKey, CyberWitchSpotlightContent } from '@/lib/spotlight/cyberwitch-kit-content'

// THE CYBERWITCH KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of a Spotlight (Stack, Card wall, Story, Calendar first, Shop front,
// Profile). Server Component, no hooks. Reads CyberWitchSpotlightContent (lib/spotlight/cyberwitch-kit-content.ts) and the theme's
// --cw-* tokens only: the root carries data-house-theme="cyberwitch" and the accent (data-accent), and the styles read var(--cw-*).
// Dark only. Filled buttons carry ink, never white. Photos are the owner's or the theme's iron surface; nothing is invented.
// Registered with CyberWitch's Spotlight wiring, which maps a stored `cyberwitch-kit:<name>` id to a layout here.

type C = CyberWitchSpotlightContent
type Icon = C['doors'][number]['icon']

export type CyberWitchKitLayoutId = `cyberwitch-kit:${CyberWitchLayoutKey}`

/** The layouts, in the design's order, with the design's own words for what each is for. */
export const CYBERWITCH_KIT_LAYOUTS: readonly { id: CyberWitchKitLayoutId; label: string; blurb: string }[] = [
  { id: 'cyberwitch-kit:stack', label: 'Stack', blurb: 'Every way in, stacked' },
  { id: 'cyberwitch-kit:card-wall', label: 'Card wall', blurb: 'Two columns of cards' },
  { id: 'cyberwitch-kit:story', label: 'Story', blurb: 'One photo, a few lines, one button' },
  { id: 'cyberwitch-kit:calendar-first', label: 'Calendar first', blurb: 'Open times lead' },
  { id: 'cyberwitch-kit:shop-front', label: 'Shop front', blurb: 'Services as products' },
  { id: 'cyberwitch-kit:profile', label: 'Profile', blurb: 'The owner first' },
]

const ICONS: Record<Icon, LucideIcon> = {
  message: MessageCircle, sparkle: Sparkles, calendar: CalendarDays, shield: ShieldCheck, star: Star, award: Award, wrench: Wrench,
  home: House, clock: Clock, leaf: Leaf, heart: Heart, chart: ChartColumn, briefcase: Briefcase, tag: Tag, bolt: Zap, car: Car,
  droplet: Droplet, check: Check, users: Users, sun: Sun, user: User, mail: Mail, eye: Eye, pin: MapPin,
}

function Tile({ icon, size = 36 }: { icon: Icon; size?: number }) {
  const I = ICONS[icon]
  return <span className="cws-tile" style={{ width: size, height: size }} aria-hidden><I size={Math.round(size * 0.45)} strokeWidth={2} /></span>
}
const Eyebrow = ({ children, accent }: { children: ReactNode; accent?: boolean }) => <div className={`cws-eb${accent ? ' cws-eb--accent' : ''}`}>{children}</div>
function Display({ title, em, size, className = '' }: { title: string; em: string; size: number; className?: string }) {
  return <div className={`cws-d ${className}`} style={{ fontSize: size }}>{title} <em>{em}</em></div>
}
function Btn({ href, children, tone = 'accent', size = 'lg' }: { href: string; children: ReactNode; tone?: 'accent' | 'secondary' | 'primary'; size?: 'lg' | 'sm' }) {
  const t = tone === 'primary' ? '' : ` cws-btn--${tone}`
  return <Link href={href} className={`cws-btn${t} cws-btn--${size}`}>{children}</Link>
}
function Name({ c, size = 24 }: { c: C; size?: number }) {
  return <div className="cws-name"><span className="cws-mark" style={{ width: 40, height: 40 }} aria-hidden>{c.name.charAt(0)}</span><span style={{ fontSize: size }}>{c.name}</span></div>
}
function Socials({ size }: { size: number }) {
  return <div className="cws-socials">{[Phone, MessageCircle, Mail].map((I, i) => <span key={i} className="cws-iconbtn" style={{ width: size * 2.6, height: size * 2.6 }}><I size={size} aria-hidden /></span>)}</div>
}
function Foot() {
  return <div className="cws-foot"><i role="separator" /><div className="cws-mono">Spotlight on Frequency</div></div>
}
function Letter({ c, compact }: { c: C; compact?: boolean }) {
  if (!c.letter) return null
  return (
    <div className="cws-card cws-letter">
      <Display title={c.letter.title} em={c.letter.em} size={compact ? 20 : 24} />
      <p>{c.letter.body}</p>
      <form action={c.letter.action} method="get"><Input variant="seamless" className="cws-input" type="email" name="email" aria-label="Email" placeholder="you@email.com" required /><button className="cws-btn cws-btn--accent cws-btn--sm" type="submit">Join</button></form>
    </div>
  )
}
function Quote({ c }: { c: C }) {
  if (!c.quote) return null
  const words = c.quote.text.split(' ')
  return (
    <div className="cws-quote"><div>
      <div className="cws-d">“{words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em>”</div>
      <div className="cws-mono"><span>{c.quote.who}</span> · {c.quote.role}</div>
    </div></div>
  )
}
function Review({ r }: { r: NonNullable<C['review']> }) {
  return <div className="cws-card cws-review"><p>“{r.q}”</p><div className="cws-mono"><span>{r.who}</span> · {r.what}</div></div>
}
function Photo({ c }: { c: C }) {
  return c.hero.photo ? <Image src={c.hero.photo} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectPosition: '70% 30%' }} /> : null
}
function Hero({ c, height }: { c: C; height: number }) {
  return (
    <section className="cws-hero" style={{ height }} data-photo={c.hero.photo ? '' : undefined}>
      <Photo c={c} />
      <div className="cws-hero-top"><Name c={c} /></div>
      <div className="cws-hero-body">
        <Eyebrow>{c.hero.eyebrow}</Eyebrow>
        <h1 className="cws-d">{c.hero.title} <em>{c.hero.em}</em></h1>
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
      </div>
    </section>
  )
}
function Door({ d }: { d: C['doors'][number] }) {
  return <Link href={d.href} className="cws-card cws-door"><Tile icon={d.icon} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowRight size={12} className="cws-sub" aria-hidden /></Link>
}

function Stack({ c }: { c: C }) {
  return (
    <>
      <Hero c={c} height={380} />
      <div className="cws-stack-list">{c.doors.map((d) => <Door key={d.id} d={d} />)}</div>
      {c.footerCta && <div className="cws-pad cws-closing" style={{ paddingTop: 20 }}><Btn href={c.footerCta.href}>{c.footerCta.label}<ArrowRight size={14} aria-hidden /></Btn></div>}
      {c.letter && <div className="cws-pad" style={{ paddingTop: 12 }}><Letter c={c} compact /></div>}
      <Foot />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  const f = c.featured
  return (
    <>
      <div className="cws-wall-head"><Name c={c} size={22} /><Display title={c.hero.title} em={c.hero.em} size={34} className="big" /></div>
      <div className="cws-grid">
        <div className="cws-card cws-sq cws-wide">
          <Eyebrow accent>{f.eyebrow}</Eyebrow>
          <div><div className="cws-d">{f.title}</div><small>{f.meta}</small></div>
          <div><Btn href={f.href} size="sm">{f.cta}</Btn></div>
        </div>
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.id} href={d.href} className="cws-card cws-sq"><Tile icon={d.icon} size={34} /><div><b>{d.title}</b><small>{d.meta}</small></div></Link>
        ))}
        {c.letter && <div className="cws-span"><Letter c={c} compact /></div>}
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  return (
    <>
      <div className="cws-story-photo" data-photo={c.hero.photo ? '' : undefined}>
        <Photo c={c} />
        <div className="cws-story-name"><Name c={c} /></div>
        <div className="cws-story-text"><Eyebrow>{c.hero.eyebrow}</Eyebrow><h1 className="cws-d">{c.hero.title} <em>{c.hero.em}</em></h1></div>
      </div>
      <div className="cws-story-body">
        <p>{c.hero.body}</p>
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
        <div className="cws-links">{c.offers.map((o) => <Link key={o.name} href="/services">{o.name}</Link>)}</div>
      </div>
      <Quote c={c} />
      <Foot />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  return (
    <>
      <div className="cws-row-head"><Name c={c} size={20} /><Socials size={12} /></div>
      <div className="cws-lead"><Eyebrow>Book online</Eyebrow><Display title={c.headings.openings.title} em={c.headings.openings.em} size={34} /></div>
      <div className="cws-pad" style={{ paddingTop: 14 }}>
        {c.openings.map((o, i) => (
          <Link key={o.day} href={c.featured.href} className="cws-date">
            <div className={`cws-day${i === 0 ? ' cws-day--first' : ''}`}><span className="cws-mono">{o.mon}</span><b>{o.day}</b></div>
            <div><b className="t">{o.title}</b><small>{o.time} · {o.where}</small></div>
            {o.left ? <span className="cws-badge">{o.left} left</span> : <span className="cws-mono">Waitlist</span>}
          </Link>
        ))}
      </div>
      <div className="cws-pad cws-stackbtns" style={{ paddingTop: 12 }}>
        <Btn href={c.featured.href}>{c.featured.cta}</Btn>
        <Btn href="/book" tone="secondary">{c.secondaryCta}</Btn>
      </div>
      {c.offers.length > 0 && (
        <div className="cws-pad" style={{ paddingTop: 22 }}>
          <Eyebrow>Services</Eyebrow>
          <div className="cws-chips">{c.offers.map((o) => { const I = ICONS[o.icon]; return <Link key={o.name} href="/services" className="cws-chip"><I size={13} aria-hidden />{o.name}</Link> })}</div>
        </div>
      )}
      <Foot />
    </>
  )
}

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <div className="cws-row-head"><Name c={c} size={20} /><Tag size={18} className="cws-sub" aria-hidden /></div>
      <div className="cws-lead"><Eyebrow>Services &amp; pricing</Eyebrow><Display title={c.headings.services.title} em={c.headings.services.em} size={34} /></div>
      <div className="cws-grid">
        {c.offers.map((s, i) => (
          <div key={s.name} className={`cws-card cws-prod${i === 1 ? ' cws-prod--first' : ''}`}>
            <div className="cws-prod-photo"><Tile icon={s.icon} size={44} /></div>
            <div className="cws-prod-body">
              <b>{s.name}</b><small>{s.dur}</small>
              <footer><span className="cws-mono">{s.price}</span><Btn href={c.cta.href} size="sm" tone={i === 1 ? 'accent' : 'secondary'}>Book</Btn></footer>
            </div>
          </div>
        ))}
        {c.proof && (
          <div className="cws-card cws-proof cws-span"><div><Eyebrow accent>{c.proof.label}</Eyebrow><b>{c.proof.sub}</b></div><Tile icon={c.proof.icon} size={36} /></div>
        )}
      </div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  return (
    <>
      <div className="cws-profile-head">
        <div className="cws-portrait"><span aria-hidden>{c.owner.charAt(0)}</span></div>
        <div className="cws-d cws-profile-name">{c.owner}</div>
        <Eyebrow>{c.role} · {c.name}</Eyebrow>
        <p>{c.story}</p>
        <Socials size={14} />
      </div>
      <div className="cws-pad" style={{ paddingTop: 22 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
      {c.secondReview && <div className="cws-pad" style={{ paddingTop: 22 }}><Review r={c.secondReview} /></div>}
      <div className="cws-pad" style={{ paddingTop: 22 }}>
        <Eyebrow>Where to start</Eyebrow>
        <div className="cws-card cws-list">
          {c.doors.slice(0, 3).map((d) => (
            <Link key={d.id} href={d.href}><Tile icon={d.icon} size={32} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowRight size={12} className="cws-sub" aria-hidden /></Link>
          ))}
        </div>
      </div>
      <Foot />
    </>
  )
}

/** The registry: a stored layout key to the component that draws it. */
const LAYOUT_COMPONENT: Record<CyberWitchLayoutKey, (p: { c: C }) => ReactNode> = {
  stack: Stack, 'card-wall': CardWall, story: Story, 'calendar-first': CalendarFirst, 'shop-front': ShopFront, profile: Profile,
}

/** One CyberWitch Spotlight layout, wearing the owner's accent. The `<style>` carries the theme's tokens and
 *  the layout sheet, so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function CyberWitchKitSpotlightLayout({ layout, content, className }: { layout: CyberWitchKitLayoutId; content: CyberWitchSpotlightContent; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout.slice('cyberwitch-kit:'.length) as CyberWitchLayoutKey]
  if (!Layout) return null
  return (
    <div data-house-theme="cyberwitch" data-accent={content.accent} data-layout={layout} className={`cws${className ? ` ${className}` : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: CYBERWITCH_TOKENS_CSS + CYBERWITCH_DIALS_CSS + CYBERWITCH_ACCENT_CSS + CYBERWITCH_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
