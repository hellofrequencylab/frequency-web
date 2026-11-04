import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Input } from '@/components/ui/field'
import {
  ArrowRight, Award, Check, Briefcase, CalendarDays, Car, ChartColumn, Clock, Droplet, Eye, Heart, House, Leaf, Mail, MapPin, MessageCircle,
  Phone, ShieldCheck, Sparkles, Star, Sun, Tag, User, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import { SERVICES_DAY_CSS, SERVICES_TOKENS_CSS } from '@/lib/theme/services'
import { SERVICES_ACCENT_CSS, SERVICES_KIT_LAYOUTS_CSS } from './services-kit-layouts-css'
import type { ServicesLayoutKey, ServicesSpotlightContent } from '@/lib/spotlight/services-kit-content'

// THE SERVICES KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of the design's Spotlight Layouts page (Stack,
// Card wall, Story, Calendar first, Shop front, Profile). Server Component, no hooks. Reads ServicesSpotlightContent
// (lib/spotlight/services-kit-content.ts) and the theme's --sv-* tokens only: the root carries data-house-theme="services",
// the register (data-th) and the accent (data-accent), and the styles read var(--sv-*). Filled buttons carry ink, never
// white. Photos are the owner's or the theme's gradient surface; nothing is invented. Registered with the Services
// Spotlight wiring (LIVE-1994), which maps a stored `services-kit:<name>` id to a layout here.

type C = ServicesSpotlightContent
type Icon = C['doors'][number]['icon']

export type ServicesKitLayoutId = `services-kit:${ServicesLayoutKey}`

/** The layouts, in the design's order, with the design's own words for what each is for. */
export const SERVICES_KIT_LAYOUTS: readonly { id: ServicesKitLayoutId; label: string; blurb: string }[] = [
  { id: 'services-kit:stack', label: 'Stack', blurb: 'Every way in, stacked' },
  { id: 'services-kit:card-wall', label: 'Card wall', blurb: 'Two columns of cards' },
  { id: 'services-kit:story', label: 'Story', blurb: 'One photo, a few lines, one button' },
  { id: 'services-kit:calendar-first', label: 'Calendar first', blurb: 'Open times lead' },
  { id: 'services-kit:shop-front', label: 'Shop front', blurb: 'Services as products' },
  { id: 'services-kit:profile', label: 'Profile', blurb: 'The owner first' },
]

const ICONS: Record<Icon, LucideIcon> = {
  message: MessageCircle, sparkle: Sparkles, calendar: CalendarDays, shield: ShieldCheck, star: Star, award: Award, wrench: Wrench,
  home: House, clock: Clock, leaf: Leaf, heart: Heart, chart: ChartColumn, briefcase: Briefcase, tag: Tag, bolt: Zap, car: Car,
  droplet: Droplet, check: Check, users: Users, sun: Sun, user: User, mail: Mail, eye: Eye, pin: MapPin,
}

function Tile({ icon, size = 36 }: { icon: Icon; size?: number }) {
  const I = ICONS[icon]
  return <span className="svs-tile" style={{ width: size, height: size }} aria-hidden><I size={Math.round(size * 0.45)} strokeWidth={2} /></span>
}
const Eyebrow = ({ children, accent }: { children: ReactNode; accent?: boolean }) => <div className={`svs-eb${accent ? ' svs-eb--accent' : ''}`}>{children}</div>
function Display({ title, em, size, className = '' }: { title: string; em: string; size: number; className?: string }) {
  return <div className={`svs-d ${className}`} style={{ fontSize: size }}>{title} <em>{em}</em></div>
}
function Btn({ href, children, tone = 'accent', size = 'lg' }: { href: string; children: ReactNode; tone?: 'accent' | 'secondary' | 'primary'; size?: 'lg' | 'sm' }) {
  const t = tone === 'primary' ? '' : ` svs-btn--${tone}`
  return <Link href={href} className={`svs-btn${t} svs-btn--${size}`}>{children}</Link>
}
function Name({ c, size = 24 }: { c: C; size?: number }) {
  return <div className="svs-name"><span className="svs-mark" style={{ width: 40, height: 40 }} aria-hidden>{c.name.charAt(0)}</span><span style={{ fontSize: size }}>{c.name}</span></div>
}
function Socials({ size }: { size: number }) {
  return <div className="svs-socials">{[Phone, MessageCircle, Mail].map((I, i) => <span key={i} className="svs-iconbtn" style={{ width: size * 2.6, height: size * 2.6 }}><I size={size} aria-hidden /></span>)}</div>
}
function Foot() {
  return <div className="svs-foot"><i role="separator" /><div className="svs-mono">Spotlight on Frequency</div></div>
}
function Letter({ c, compact }: { c: C; compact?: boolean }) {
  if (!c.letter) return null
  return (
    <div className="svs-card svs-letter">
      <Display title={c.letter.title} em={c.letter.em} size={compact ? 20 : 24} />
      <p>{c.letter.body}</p>
      <form action={c.letter.action} method="get"><Input variant="seamless" className="svs-input" type="email" name="email" aria-label="Email" placeholder="you@email.com" required /><button className="svs-btn svs-btn--accent svs-btn--sm" type="submit">Join</button></form>
    </div>
  )
}
function Quote({ c }: { c: C }) {
  if (!c.quote) return null
  const words = c.quote.text.split(' ')
  return (
    <div className="svs-quote"><div>
      <div className="svs-d">“{words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em>”</div>
      <div className="svs-mono"><span>{c.quote.who}</span> · {c.quote.role}</div>
    </div></div>
  )
}
function Review({ r }: { r: NonNullable<C['review']> }) {
  return <div className="svs-card svs-review"><p>“{r.q}”</p><div className="svs-mono"><span>{r.who}</span> · {r.what}</div></div>
}
function Photo({ c }: { c: C }) {
  return c.hero.photo ? <Image src={c.hero.photo} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectPosition: '70% 30%' }} /> : null
}
function Hero({ c, height }: { c: C; height: number }) {
  return (
    <section className="svs-hero" style={{ height }} data-photo={c.hero.photo ? '' : undefined}>
      <Photo c={c} />
      <div className="svs-hero-top"><Name c={c} /></div>
      <div className="svs-hero-body">
        <Eyebrow>{c.hero.eyebrow}</Eyebrow>
        <h1 className="svs-d">{c.hero.title} <em>{c.hero.em}</em></h1>
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
      </div>
    </section>
  )
}
function Door({ d }: { d: C['doors'][number] }) {
  return <Link href={d.href} className="svs-card svs-door"><Tile icon={d.icon} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowRight size={12} className="svs-sub" aria-hidden /></Link>
}

function Stack({ c }: { c: C }) {
  return (
    <>
      <Hero c={c} height={380} />
      <div className="svs-stack-list">{c.doors.map((d) => <Door key={d.id} d={d} />)}</div>
      {c.letter && <div className="svs-pad" style={{ paddingTop: 12 }}><Letter c={c} compact /></div>}
      <Foot />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  const f = c.featured
  return (
    <>
      <div className="svs-wall-head"><Name c={c} size={22} /><Display title={c.hero.title} em={c.hero.em} size={34} className="big" /></div>
      <div className="svs-grid">
        <div className="svs-card svs-sq svs-wide">
          <Eyebrow accent>{f.eyebrow}</Eyebrow>
          <div><div className="svs-d">{f.title}</div><small>{f.meta}</small></div>
          <div><Btn href={f.href} size="sm">{f.cta}</Btn></div>
        </div>
        {c.doors.slice(0, 4).map((d) => (
          <Link key={d.id} href={d.href} className="svs-card svs-sq"><Tile icon={d.icon} size={34} /><div><b>{d.title}</b><small>{d.meta}</small></div></Link>
        ))}
        {c.letter && <div className="svs-span"><Letter c={c} compact /></div>}
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  return (
    <>
      <div className="svs-story-photo" data-photo={c.hero.photo ? '' : undefined}>
        <Photo c={c} />
        <div className="svs-story-name"><Name c={c} /></div>
        <div className="svs-story-text"><Eyebrow>{c.hero.eyebrow}</Eyebrow><h1 className="svs-d">{c.hero.title} <em>{c.hero.em}</em></h1></div>
      </div>
      <div className="svs-story-body">
        <p>{c.hero.body}</p>
        <div style={{ marginTop: 18 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
        <div className="svs-links">{c.offers.map((o) => <Link key={o.name} href="/services">{o.name}</Link>)}</div>
      </div>
      <Quote c={c} />
      <Foot />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  return (
    <>
      <div className="svs-row-head"><Name c={c} size={20} /><Socials size={12} /></div>
      <div className="svs-lead"><Eyebrow>Book online</Eyebrow><Display title={c.headings.openings.title} em={c.headings.openings.em} size={34} /></div>
      <div className="svs-pad" style={{ paddingTop: 14 }}>
        {c.openings.map((o, i) => (
          <Link key={o.day} href={c.featured.href} className="svs-date">
            <div className={`svs-day${i === 0 ? ' svs-day--first' : ''}`}><span className="svs-mono">{o.mon}</span><b>{o.day}</b></div>
            <div><b className="t">{o.title}</b><small>{o.time} · {o.where}</small></div>
            {o.left ? <span className="svs-badge">{o.left} left</span> : <span className="svs-mono">Waitlist</span>}
          </Link>
        ))}
      </div>
      <div className="svs-pad svs-stackbtns" style={{ paddingTop: 12 }}>
        <Btn href={c.featured.href}>{c.featured.cta}</Btn>
        <Btn href="/book" tone="secondary">{c.secondaryCta}</Btn>
      </div>
      {c.offers.length > 0 && (
        <div className="svs-pad" style={{ paddingTop: 22 }}>
          <Eyebrow>Services</Eyebrow>
          <div className="svs-chips">{c.offers.map((o) => { const I = ICONS[o.icon]; return <Link key={o.name} href="/services" className="svs-chip"><I size={13} aria-hidden />{o.name}</Link> })}</div>
        </div>
      )}
      <Foot />
    </>
  )
}

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <div className="svs-row-head"><Name c={c} size={20} /><Tag size={18} className="svs-sub" aria-hidden /></div>
      <div className="svs-lead"><Eyebrow>Services &amp; pricing</Eyebrow><Display title={c.headings.services.title} em={c.headings.services.em} size={34} /></div>
      <div className="svs-grid">
        {c.offers.map((s, i) => (
          <div key={s.name} className={`svs-card svs-prod${i === 1 ? ' svs-prod--first' : ''}`}>
            <div className="svs-prod-photo"><Tile icon={s.icon} size={44} /></div>
            <div className="svs-prod-body">
              <b>{s.name}</b><small>{s.dur}</small>
              <footer><span className="svs-mono">{s.price}</span><Btn href={c.cta.href} size="sm" tone={i === 1 ? 'accent' : 'secondary'}>Book</Btn></footer>
            </div>
          </div>
        ))}
        {c.proof && (
          <div className="svs-card svs-proof svs-span"><div><Eyebrow accent>{c.proof.label}</Eyebrow><b>{c.proof.sub}</b></div><Tile icon={c.proof.icon} size={36} /></div>
        )}
      </div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  return (
    <>
      <div className="svs-profile-head">
        <div className="svs-portrait"><span aria-hidden>{c.owner.charAt(0)}</span></div>
        <div className="svs-d svs-profile-name">{c.owner}</div>
        <Eyebrow>{c.role} · {c.name}</Eyebrow>
        <p>{c.story}</p>
        <Socials size={14} />
      </div>
      <div className="svs-pad" style={{ paddingTop: 22 }}><Btn href={c.cta.href}>{c.cta.label}<ArrowRight size={14} aria-hidden /></Btn></div>
      {c.secondReview && <div className="svs-pad" style={{ paddingTop: 22 }}><Review r={c.secondReview} /></div>}
      <div className="svs-pad" style={{ paddingTop: 22 }}>
        <Eyebrow>Where to start</Eyebrow>
        <div className="svs-card svs-list">
          {c.doors.slice(0, 3).map((d) => (
            <Link key={d.id} href={d.href}><Tile icon={d.icon} size={32} /><span><b>{d.title}</b><small>{d.meta}</small></span><ArrowRight size={12} className="svs-sub" aria-hidden /></Link>
          ))}
        </div>
      </div>
      <Foot />
    </>
  )
}

/** The registry: a stored layout key to the component that draws it. */
const LAYOUT_COMPONENT: Record<ServicesLayoutKey, (p: { c: C }) => ReactNode> = {
  stack: Stack, 'card-wall': CardWall, story: Story, 'calendar-first': CalendarFirst, 'shop-front': ShopFront, profile: Profile,
}

/** One Services Spotlight layout, wearing the owner's accent and register. The `<style>` carries the theme's tokens and
 *  the layout sheet, so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function ServicesKitSpotlightLayout({ layout, content, register = 'night', className }: { layout: ServicesKitLayoutId; content: ServicesSpotlightContent; register?: 'night' | 'day'; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout.slice('services-kit:'.length) as ServicesLayoutKey]
  if (!Layout) return null
  return (
    <div data-house-theme="services" data-th={register} data-accent={content.accent} data-layout={layout} className={`svs${className ? ` ${className}` : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: SERVICES_TOKENS_CSS + SERVICES_DAY_CSS + SERVICES_ACCENT_CSS + SERVICES_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
