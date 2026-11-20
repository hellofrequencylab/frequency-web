import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { DoorRuns } from '@/components/spotlight/door-runs'
import {
  ArrowRight, Award, Check, Briefcase, CalendarDays, Car, ChartColumn, Clock, Droplet, Eye, Heart, House, Leaf, Mail, MapPin, MessageCircle,
  ShieldCheck, Sparkles, Star, Sun, Tag, User, Users, Wrench, Zap, type LucideIcon,
} from 'lucide-react'
import { MINDLESS_ACCENT_CSS, MINDLESS_DIALS_CSS, MINDLESS_TOKENS_CSS } from '@/lib/theme/mindless'
import { MINDLESS_KIT_LAYOUTS_CSS } from './mindless-kit-layouts-css'
import type { MindlessLayoutKey, MindlessSpotlightContent } from '@/lib/spotlight/mindless-kit-content'

// THE MINDLESS KIT SPOTLIGHT LAYOUTS: the six whole-page layouts of a Spotlight (Stack, Card wall, Story, Calendar first, Shop front,
// Profile). Server Component, no hooks. Reads MindlessSpotlightContent (lib/spotlight/mindless-kit-content.ts) and the theme's --ml-*
// tokens only: the root carries data-house-theme="mindless" and the accent (data-accent), and the styles read var(--ml-*). Night here.
// Filled buttons carry ink. Photos are the owner's; the sample page wears the theme's own pictures, a live page without one shows the
// raised ground. Drawn to the design's Spotlight surface: round portrait, drip wordmark, paint-sticker buttons, raised doors.
// Registered with Mindless's Spotlight wiring, which maps a stored `mindless-kit:<name>` id to a layout here.

type C = MindlessSpotlightContent
type Icon = C['doors'][number]['icon']

export type MindlessKitLayoutId = `mindless-kit:${MindlessLayoutKey}`

/** The layouts, in the design's order, with the design's own words for what each is for. */
export const MINDLESS_KIT_LAYOUTS: readonly { id: MindlessKitLayoutId; label: string; blurb: string }[] = [
  { id: 'mindless-kit:stack', label: 'Stack', blurb: 'Every way in, stacked' },
  { id: 'mindless-kit:card-wall', label: 'Card wall', blurb: 'Two columns of cards' },
  { id: 'mindless-kit:story', label: 'Story', blurb: 'One photo, a few lines, one button' },
  { id: 'mindless-kit:calendar-first', label: 'Calendar first', blurb: 'Open times lead' },
  { id: 'mindless-kit:shop-front', label: 'Shop front', blurb: 'Services as products' },
  { id: 'mindless-kit:profile', label: 'Profile', blurb: 'The owner first' },
]

const ICONS: Record<Icon, LucideIcon> = {
  message: MessageCircle, sparkle: Sparkles, calendar: CalendarDays, shield: ShieldCheck, star: Star, award: Award, wrench: Wrench,
  home: House, clock: Clock, leaf: Leaf, heart: Heart, chart: ChartColumn, briefcase: Briefcase, tag: Tag, bolt: Zap, car: Car,
  droplet: Droplet, check: Check, users: Users, sun: Sun, user: User, mail: Mail, eye: Eye, pin: MapPin,
}

function Glyph({ icon, size = 22 }: { icon: Icon; size?: number }) {
  const I = ICONS[icon]
  return <span className="mls-glyph" aria-hidden><I size={size} strokeWidth={2} /></span>
}
/** The design's paint sticker (accent) or the bone outline (secondary). */
function Btn({ href, children, tone = 'accent', full }: { href: string; children: ReactNode; tone?: 'accent' | 'secondary'; full?: boolean }) {
  if (tone === 'secondary') return <Link href={href} className={`mls-placard${full ? ' mls-full' : ''}`}>{children}</Link>
  return <Link href={href} className={`mls-sticker${full ? ' mls-full' : ''}`}><span>{children}</span></Link>
}
/** The wordmark (design Logo): the name in the drip display, the descriptor in tracked caps under it. */
function Logo({ c, width = 220, descriptor = true }: { c: C; width?: number; descriptor?: boolean }) {
  // The design's sizing: the face shrinks as the name grows, so a long name still fits the phone.
  const size = Math.round(width / Math.max(3.2, c.name.length * 0.5))
  return (
    <span className="mls-logo">
      <span className="mls-logo-name" style={{ fontSize: size }}>{c.name}</span>
      {descriptor && c.descriptor && <span className="mls-logo-desc"><i />{c.descriptor}<i /></span>}
    </span>
  )
}
/** The round portrait: the owner's photo, or the raised ground when there is none. */
function Arch({ src, width }: { src: string | null; width: number }) {
  return <span className="mls-arch" style={{ width }}>{src && <Image src={src} alt="" fill sizes={`${width * 2}px`} style={{ objectFit: 'cover', objectPosition: '50% 30%' }} />}</span>
}
/** The top of most layouts (design SpotTop): portrait, wordmark and the one line a stranger should remember. */
function Top({ c, big }: { c: C; big?: boolean }) {
  return (
    <div className={`mls-top${big ? ' mls-top--big' : ''}`}>
      <Arch src={c.portrait} width={big ? 132 : 92} />
      <Logo c={c} width={big ? 220 : 180} />
      <p className="mls-pain">{c.pain}</p>
    </div>
  )
}
const Label = ({ children }: { children: ReactNode }) => <div className="mls-label">{children}</div>
const Scrawl = ({ children }: { children: ReactNode }) => <span className="mls-scrawl" aria-hidden>{children}</span>
function Foot() {
  return <div className="mls-foot"><i role="separator" /><div className="mls-label">Spotlight on Frequency</div></div>
}
/** A way in, on a raised card (design Door): icon, caps title, one muted line. */
function Door({ d, compact }: { d: C['doors'][number]; compact?: boolean }) {
  return (
    <Link href={d.href} className={`mls-plate mls-door${compact ? ' mls-door--compact' : ''}`}>
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
      <div className="mls-col">
        <Btn href={c.cta.href} full>{c.cta.label}</Btn>
        <DoorRuns doors={c.doors} card={(d) => <Door key={d.id} d={d} />} button={(d) => <Btn key={d.id} href={d.href} tone="secondary" full>{d.title}</Btn>} />
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
      <div className="mls-grid">
        <div className="mls-span"><Btn href={c.featured.href} full>{c.featured.cta}</Btn></div>
        <DoorRuns
          doors={c.doors}
          card={(d) => <Link key={d.id} href={d.href} className="mls-plate mls-sq"><Glyph icon={d.icon} size={24} /><b>{d.title}</b></Link>}
          button={(d) => <div key={d.id} className="mls-span"><Btn href={d.href} tone="secondary" full>{d.title}</Btn></div>}
        />
      </div>
      <Foot />
    </>
  )
}

function Story({ c }: { c: C }) {
  const near = c.doors.filter((d) => d.key === 'book' || d.id === 'events').slice(0, 2)
  return (
    <>
      <div className="mls-story-photo" data-photo={c.hero.photo ? '' : undefined}>
        {c.hero.photo && <Image src={c.hero.photo} alt="" fill sizes="(max-width: 640px) 100vw, 640px" style={{ objectFit: 'cover', objectPosition: '60% 42%' }} />}
        <div className="mls-story-name"><Logo c={c} width={150} descriptor={false} /></div>
        <h1 className="mls-d">{c.hero.title} <em>{c.hero.em}</em></h1>
      </div>
      <div className="mls-col">
        <p className="mls-body">{c.story || c.hero.body}</p>
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
      <div className="mls-col">
        <Label>This week</Label>
        {c.openings.map((o) => (
          <Link key={o.day} href={c.featured.href} className="mls-plate mls-date">
            <span className="mls-day"><span className="mls-label">{o.mon}</span><b>{Number(o.day)}</b></span>
            <span className="mls-date-t"><b>{o.title}</b><small>{o.time} · {o.where}</small></span>
            <span className="mls-badge">{o.left ? `${o.left} left` : 'Waitlist'}</span>
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
      <div className="mls-grid mls-shop">
        {c.offers.map((s) => (
          <Link key={s.name} href="/services" className="mls-prod">
            <span className="mls-taped"><Glyph icon={s.icon} size={28} /></span>
            <b>{s.name}</b>
            <span className="mls-price">{s.price} · {s.dur}</span>
          </Link>
        ))}
        {c.offers.length === 0 && <div className="mls-span"><Btn href="/services" full>{c.secondaryCta}</Btn></div>}
      </div>
      <div className="mls-col"><Btn href={c.cta.href} full>{c.cta.label}</Btn></div>
      <Foot />
    </>
  )
}

function Profile({ c }: { c: C }) {
  const near = c.doors.filter((d) => ['reviews', 'letter'].includes(d.id))
  return (
    <>
      <div className="mls-profile">
        <div className="mls-profile-head">
          <Arch src={c.portrait} width={78} />
          <span><span className="mls-profile-name">{c.owner}</span><span className="mls-profile-role">{c.role} · {c.name}</span></span>
        </div>
        {c.quote ? <blockquote className="mls-quote">“{c.quote.text}”</blockquote> : <p className="mls-body">{c.story}</p>}
        <Scrawl>{c.tag}</Scrawl>
      </div>
      <div className="mls-col">
        <Btn href={c.cta.href} full>{c.cta.label}</Btn>
        {near.map((d) => <Door key={d.id} d={d} compact />)}
      </div>
      <Foot />
    </>
  )
}

/** The registry: a stored layout key to the component that draws it. */
const LAYOUT_COMPONENT: Record<MindlessLayoutKey, (p: { c: C }) => ReactNode> = {
  stack: Stack, 'card-wall': CardWall, story: Story, 'calendar-first': CalendarFirst, 'shop-front': ShopFront, profile: Profile,
}

/** An owner's own paint (none of the three): the accent ramp is mixed from it, the way the website's skin follows --color-primary. */
function ownNeon(hex: string | null): CSSProperties | undefined {
  if (!hex) return undefined
  return {
    '--ml-accent': hex, '--ml-accent-hover': `color-mix(in oklab, ${hex} 78%, white)`, '--ml-accent-text': `color-mix(in oklab, ${hex} 70%, white)`,
    '--ml-accent-soft': `color-mix(in oklab, ${hex} 60%, black)`,
  } as CSSProperties
}

/** One Mindless Spotlight layout, wearing the owner's accent. The `<style>` carries the theme's tokens and
 *  the layout sheet, so it renders the same anywhere (the Spotlight route, a preview, a test). */
export function MindlessKitSpotlightLayout({ layout, content, className }: { layout: MindlessKitLayoutId; content: MindlessSpotlightContent; className?: string }) {
  const Layout = LAYOUT_COMPONENT[layout.slice('mindless-kit:'.length) as MindlessLayoutKey]
  if (!Layout) return null
  return (
    <div data-house-theme="mindless" data-accent={content.accent} data-layout={layout} className={`mls${className ? ` ${className}` : ''}`} style={ownNeon(content.accentHex)}>
      <style dangerouslySetInnerHTML={{ __html: MINDLESS_TOKENS_CSS + MINDLESS_DIALS_CSS + MINDLESS_ACCENT_CSS + MINDLESS_KIT_LAYOUTS_CSS }} />
      <Layout c={content} />
    </div>
  )
}
