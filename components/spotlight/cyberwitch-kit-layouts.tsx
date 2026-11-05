import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, Award, Check, Briefcase, CalendarDays, Car, ChartColumn, Clock, Droplet, Eye, Heart, House, Leaf, Mail, MapPin, MessageCircle,
  ShieldCheck, Sparkles, Star, Sun, Tag, User, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import { CYBERWITCH_ACCENT_CSS, CYBERWITCH_DIALS_CSS, CYBERWITCH_TOKENS_CSS } from '@/lib/theme/cyberwitch'
import { CYBERWITCH_KIT_LAYOUTS_CSS } from './cyberwitch-kit-layouts-css'
import type { CyberWitchLayoutKey, CyberWitchSpotlightContent } from '@/lib/spotlight/cyberwitch-kit-content'

// THE CYBERWITCH KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of a Spotlight (Stack, Card wall, Story, Calendar first, Shop front,
// Profile). Server Component, no hooks. Reads CyberWitchSpotlightContent (lib/spotlight/cyberwitch-kit-content.ts) and the theme's
// --cw-* tokens only: the root carries data-house-theme="cyberwitch" and the accent (data-accent), and the styles read var(--cw-*).
// Dark only. Filled buttons carry ink, never white. Photos are the owner's; the sample page wears the theme's own pictures, a live page
// without one shows the iron surface. Drawn to the design's products.jsx: arched portrait, blackletter wordmark, sticker buttons, riveted plates.
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

function Glyph({ icon, size = 22 }: { icon: Icon; size?: number }) {
  const I = ICONS[icon]
  return <span className="cws-glyph" aria-hidden><I size={size} strokeWidth={1.75} /></span>
}
/** The design's sticker button: a hand-cut quad in marker, a degree off true (accent), or a gallery placard (secondary). */
function Btn({ href, children, tone = 'accent', full }: { href: string; children: ReactNode; tone?: 'accent' | 'secondary'; full?: boolean }) {
  if (tone === 'secondary') return <Link href={href} className={`cws-placard${full ? ' cws-full' : ''}`}>{children}</Link>
  return <Link href={href} className={`cws-sticker${full ? ' cws-full' : ''}`}><span>{children}</span></Link>
}
/** The wordmark (design Logo): the name in blackletter, the descriptor in tracked caps between two lit tube lines. */
function Logo({ c, width = 220, descriptor = true }: { c: C; width?: number; descriptor?: boolean }) {
  // The design's sizing: the face shrinks as the name grows, so a long name still fits the phone.
  const size = Math.round(width / Math.max(3.2, c.name.length * 0.5))
  return (
    <span className="cws-logo">
      <span className="cws-logo-name" style={{ fontSize: size }}>{c.name}</span>
      {descriptor && c.descriptor && <span className="cws-logo-desc"><i />{c.descriptor}<i /></span>}
    </span>
  )
}
/** The arched portrait (design .ng-arch): the owner's photo, or the iron surface when there is none. */
function Arch({ src, width }: { src: string | null; width: number }) {
  return <span className="cws-arch" style={{ width }}>{src && <Image src={src} alt="" fill sizes={`${width * 2}px`} style={{ objectFit: 'cover', objectPosition: '50% 30%' }} />}</span>
}
/** The top of most layouts (design SpotTop): arch portrait, wordmark and the one line a stranger should remember. */
function Top({ c, big }: { c: C; big?: boolean }) {
  return (
    <div className={`cws-top${big ? ' cws-top--big' : ''}`}>
      <Arch src={c.portrait} width={big ? 132 : 92} />
      <Logo c={c} width={big ? 220 : 180} />
      <p className="cws-pain">{c.pain}</p>
    </div>
  )
}
const Label = ({ children }: { children: ReactNode }) => <div className="cws-label">{children}</div>
const Scrawl = ({ children }: { children: ReactNode }) => <span className="cws-scrawl" aria-hidden>{children} ✕</span>
function Foot() {
  return <div className="cws-foot"><i role="separator" /><div className="cws-label">Spotlight on Frequency</div></div>
}
/** A way in, on a riveted steel plate (design Door): icon, caps title, one muted line. */
function Door({ d, compact }: { d: C['doors'][number]; compact?: boolean }) {
  return (
    <Link href={d.href} className={`cws-plate cws-door${compact ? ' cws-door--compact' : ''}`}>
      <Glyph icon={d.icon} size={compact ? 20 : 24} />
      <span><b>{d.title}</b><small>{d.meta}</small></span>
      <ArrowRight size={14} aria-hidden />
    </Link>
  )
}

function Stack({ c }: { c: C }) {
  return (
    <>
      <Top c={c} big />
      <div className="cws-col">
        <Btn href={c.cta.href} full>{c.cta.label}</Btn>
        {c.doors.map((d) => <Door key={d.id} d={d} />)}
        {c.footerCta && <Btn href={c.footerCta.href} tone="secondary" full>{c.footerCta.label}</Btn>}
      </div>
      <Foot />
    </>
  )
}

function CardWall({ c }: { c: C }) {
  return (
    <>
      <Top c={c} />
      <div className="cws-grid">
        <div className="cws-span"><Btn href={c.featured.href} full>{c.featured.cta}</Btn></div>
        {c.doors.map((d) => (
          <Link key={d.id} href={d.href} className="cws-plate cws-sq"><Glyph icon={d.icon} size={24} /><b>{d.title}</b></Link>
        ))}
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  const near = c.doors.filter((d) => d.key === 'book' || d.id === 'events').slice(0, 2)
  return (
    <>
      <div className="cws-story-photo" data-photo={c.hero.photo ? '' : undefined}>
        {c.hero.photo && <Image src={c.hero.photo} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectFit: 'cover', objectPosition: '84% 40%' }} />}
        <div className="cws-story-name"><Logo c={c} width={150} descriptor={false} /></div>
        <h1 className="cws-d">{c.hero.title} <em>{c.hero.em}</em></h1>
      </div>
      <div className="cws-col">
        <p className="cws-body">{c.story || c.hero.body}</p>
        <Btn href={c.cta.href} full>{c.cta.label}</Btn>
        {near.map((d) => <Door key={d.id} d={d} compact />)}
      </div>
      <Foot />
    </>
  )
}

function CalendarFirst({ c }: { c: C }) {
  const groups = c.doors.find((d) => d.id === 'circles')
  return (
    <>
      <Top c={c} />
      <div className="cws-col">
        <Label>This week</Label>
        {c.openings.map((o) => (
          <Link key={o.day} href={c.featured.href} className="cws-plate cws-date">
            <span className="cws-day"><span className="cws-label">{o.mon}</span><b>{Number(o.day)}</b></span>
            <span className="cws-date-t"><b>{o.title}</b><small>{o.time} · {o.where}</small></span>
            <span className="cws-badge">{o.left ? `${o.left} left` : 'Waitlist'}</span>
          </Link>
        ))}
        {c.openings.length === 0 && <Btn href={c.featured.href} full>{c.featured.cta}</Btn>}
        {groups && <Door d={groups} compact />}
      </div>
      <Foot />
    </>
  )
}

function ShopFront({ c }: { c: C }) {
  return (
    <>
      <Top c={c} />
      <div className="cws-grid cws-shop">
        {c.offers.map((s) => (
          <Link key={s.name} href="/services" className="cws-prod">
            <span className="cws-taped"><Glyph icon={s.icon} size={28} /></span>
            <b>{s.name}</b>
            <span className="cws-price">{s.price} · {s.dur}</span>
          </Link>
        ))}
        {c.offers.length === 0 && <div className="cws-span"><Btn href="/services" full>{c.secondaryCta}</Btn></div>}
      </div>
      <div className="cws-col"><Btn href={c.cta.href} full>{c.cta.label}</Btn></div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  const near = c.doors.filter((d) => ['reviews', 'letter'].includes(d.id))
  return (
    <>
      <div className="cws-profile">
        <div className="cws-profile-head">
          <Arch src={c.portrait} width={78} />
          <span><span className="cws-profile-name">{c.owner}</span><span className="cws-profile-role">{c.role} · {c.name}</span></span>
        </div>
        {c.quote ? <blockquote className="cws-quote">“{c.quote.text}”</blockquote> : <p className="cws-body">{c.story}</p>}
        <Scrawl>{c.tag}</Scrawl>
      </div>
      <div className="cws-col">
        <Btn href={c.cta.href} full>{c.cta.label}</Btn>
        {near.map((d) => <Door key={d.id} d={d} compact />)}
      </div>
      <Foot />
    </>
  )
}

/** The registry: a stored layout key to the component that draws it. */
const LAYOUT_COMPONENT: Record<CyberWitchLayoutKey, (p: { c: C }) => ReactNode> = {
  stack: Stack, 'card-wall': CardWall, story: Story, 'calendar-first': CalendarFirst, 'shop-front': ShopFront, profile: Profile,
}

/** An owner's own neon (none of the five): the flare ramp is mixed from it, the way the website's skin follows --color-primary. */
function ownNeon(hex: string | null): CSSProperties | undefined {
  if (!hex) return undefined
  return {
    '--cw-flare-500': hex, '--cw-flare-400': `color-mix(in oklab, ${hex} 78%, white)`, '--cw-flare-300': `color-mix(in oklab, ${hex} 55%, white)`,
    '--cw-flare-600': `color-mix(in oklab, ${hex} 78%, black)`, '--cw-flare-700': `color-mix(in oklab, ${hex} 50%, black)`,
  } as CSSProperties
}

/** One CyberWitch Spotlight layout, wearing the owner's accent. The `<style>` carries the theme's tokens and
 *  the layout sheet, so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function CyberWitchKitSpotlightLayout({ layout, content, className }: { layout: CyberWitchKitLayoutId; content: CyberWitchSpotlightContent; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout.slice('cyberwitch-kit:'.length) as CyberWitchLayoutKey]
  if (!Layout) return null
  return (
    <div data-house-theme="cyberwitch" data-accent={content.accent} data-layout={layout} className={`cws${className ? ` ${className}` : ''}`} style={ownNeon(content.accentHex)}>
      <style dangerouslySetInnerHTML={{ __html: CYBERWITCH_TOKENS_CSS + CYBERWITCH_DIALS_CSS + CYBERWITCH_ACCENT_CSS + CYBERWITCH_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
