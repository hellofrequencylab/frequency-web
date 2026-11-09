// /themes/cyberwitch, drawn as CyberWitch's own theme page (design system ui_kits/products/ThemeFeature.html, extras.jsx ThemeFeature):
// the neon-wall hero with the CYBER/Witch wordmark, the four needs on taped wheatpaste posters, the four surfaces as real renders
// (public/brand/theme-pages/cyberwitch, scripts/render/theme-pages-shots.render.tsx), the six kits on riveted plates, the five neon
// tags, the questions and a last line. The owner asked for the theme page to wear the theme's own look (2026-11-05), so this page
// leaves Nocturne's feature layout. Server Component. Every value is a --cw-* token (lib/theme/cyberwitch.ts) under the CyberWitch root;
// it is a marketing page, so the theme fence (ADR-1906: no site theme in member, console or admin areas) is untouched.
import Link from 'next/link'
import { ArrowRight, Hourglass, KeyRound, MoonStar, SprayCan, type LucideIcon } from 'lucide-react'
import { CYBERWITCH_FONT_CLASS } from '@/components/sites/cyberwitch-fonts'
import { createSpaceHref } from '@/lib/create-space/href'
import { CYBERWITCH_KIT_INDEX } from '@/lib/sites/kits/cyberwitch-profile-index'
import { CYBERWITCH_ACCENT_CSS, CYBERWITCH_DIALS_CSS, CYBERWITCH_TOKENS_CSS } from '@/lib/theme/cyberwitch'
import { THEME_FEATURES } from '@/lib/themes/theme-feature-data'
import { CYBERWITCH_FEATURE_CSS } from '@/components/sites/cyberwitch-feature-css'
import { CyberWitchAccentDial, CyberWitchAccentImage, CyberWitchAccentRoot, CyberWitchAccentTags, CyberWitchUseLink } from './cyberwitch-accent'

const NEEDS: [LucideIcon, string, string][] = [
  [SprayCan, 'Look like nobody else', 'Blackletter, neon tags and concrete. It does not look like a template because it does not behave like one.'],
  [Hourglass, 'Get booked', 'Booking, a calendar and reminders built into every page.'],
  [KeyRound, 'Keep your people', 'Memberships that pause, a letter, a list that stays yours.'],
  [MoonStar, 'Open after dark', 'Dark only. Every block, email and page is made for the night.'],
]
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
/** The kit's sample name, the way the design's kit picker shows it. */
const KIT_NAME: Record<string, string> = { general: 'Your Name', practitioner: 'Your Practice', reader: 'Your Craft', band: 'Your Band', brand: 'Your Brand', studio: 'Your Studio' }

function Sticker({ href, children }: { href: string; children: React.ReactNode }) {
  return <CyberWitchUseLink href={href} className="cwf-sticker"><span>{children}</span></CyberWitchUseLink>
}
function Placard({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="cwf-placard">{children}</Link>
}
function Head({ n, eyebrow, title, em, lede }: { n: number; eyebrow: string; title: string; em: string; lede?: string }) {
  return (
    <header className="cwf-head">
      <span className="cwf-tape"><b>{ROMAN[n - 1]}</b> / {eyebrow}</span>
      <h2 className="cwf-d">{title} <em>{em}</em></h2>
      {lede && <p className="cwf-lede">{lede}</p>}
    </header>
  )
}
function Frame({ label, children, tall }: { label: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <figure className={`cwf-frame${tall ? ' cwf-frame--tall' : ''}`}>
      <span className="cwf-tape cwf-frame-tag">{label}</span>
      <div className="cwf-frame-in">{children}</div>
    </figure>
  )
}

export function CyberWitchThemeFeature() {
  const copy = THEME_FEATURES.cyberwitch
  const start = createSpaceHref('cyberwitch')
  return (
    <CyberWitchAccentRoot className={`cwf ${CYBERWITCH_FONT_CLASS}`}>
      <style dangerouslySetInnerHTML={{ __html: CYBERWITCH_TOKENS_CSS + CYBERWITCH_DIALS_CSS + CYBERWITCH_ACCENT_CSS + CYBERWITCH_FEATURE_CSS }} />

      <section className="cwf-hero">
        <CyberWitchAccentImage hero alt="" fill priority sizes="100vw" className="cwf-hero-photo" />
        <i className="cwf-hero-wash" aria-hidden />
        <div className="cwf-hero-in">
          <nav className="cwf-crumbs" aria-label="Breadcrumb"><Link href="/spaces">For Spaces</Link> / <Link href="/themes">Themes</Link> / <span>CyberWitch</span></nav>
          <h1 className="cwf-logo" aria-label="CyberWitch">
            <span className="cwf-logo-tag" aria-hidden>Cyber</span>
            <span className="cwf-logo-name" aria-hidden>Witch</span>
            <span className="cwf-logo-desc" aria-hidden><i />Theme Kit<i /></span>
          </h1>
          <p className="cwf-hero-lede">{copy.tagline[0]} {copy.tagline[1]} A dark street-punk look for practitioners, readers, bands, brands and studios. Pick a kit, pick a neon, publish.</p>
          <div className="cwf-actions">
            <Sticker href={start}>Use CyberWitch</Sticker>
            <Placard href="#surfaces">See every surface</Placard>
          </div>
        </div>
      </section>

      <section className="cwf-sec">
        <Head n={1} eyebrow="What it answers" title="Built to" em="get you booked." />
        <div className="cwf-posters">
          {NEEDS.map(([Icon, t, b], i) => (
            <article key={t} className="cwf-poster" style={{ '--tilt': `${[-1.2, 0.8, -0.6, 1.1][i]}deg` } as React.CSSProperties}>
              <div className="cwf-poster-top"><b className="cwf-num">{ROMAN[i]}</b><Icon size={22} strokeWidth={1.6} aria-hidden /></div>
              <h3>{t}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cwf-sec cwf-sec--sunk" id="surfaces">
        <Head n={2} eyebrow="Every surface" title="One look," em="four places." lede={copy.lead} />
        <div className="cwf-surfaces">
          <Frame label="Website"><CyberWitchAccentImage shot="site" alt="A CyberWitch website: the neon wall hero" width={1280} height={800} sizes="(max-width: 900px) 92vw, 720px" /></Frame>
          <Frame label="Spotlight" tall><CyberWitchAccentImage shot="spot" alt="A CyberWitch Spotlight: arched portrait, wordmark and riveted plates" width={780} height={1688} sizes="(max-width: 900px) 60vw, 300px" /></Frame>
          <Frame label="Email"><CyberWitchAccentImage shot="email" alt="A CyberWitch welcome email" width={900} height={760} sizes="(max-width: 900px) 92vw, 520px" /></Frame>
          <Frame label="Space page"><CyberWitchAccentImage shot="spacedesk" alt="A Space page wearing the CyberWitch faces and neon" width={1280} height={770} sizes="(max-width: 900px) 92vw, 640px" /></Frame>
        </div>
        <p className="cwf-note">Your Space page keeps Frequency&apos;s frame, so people on the network always know where they are. It wears your name, your neon and your offers.</p>
      </section>

      <section className="cwf-sec">
        <Head n={3} eyebrow="Kits" title="Start from" em="your niche." lede="Six kits write the prompts, the sample rows and which tools are on. Colour and type stay yours." />
        <div className="cwf-kits">
          {CYBERWITCH_KIT_INDEX.map((k) => (
            <CyberWitchUseLink key={k.id} href={start} className="cwf-plate cwf-kit">
              <span className="cwf-kit-name">{KIT_NAME[k.kit] ?? k.label}</span>
              <span className="cwf-label">{k.label}</span>
              <small>{k.description}</small>
            </CyberWitchUseLink>
          ))}
        </div>
      </section>

      <section className="cwf-sec cwf-sec--sunk">
        <Head n={4} eyebrow="Accents" title="Five" em="neon tags." lede="Pick one and watch this page wear it. On your Space it is one setting: your website, Spotlight, Space page and emails all follow it." />
        <CyberWitchAccentTags />
      </section>

      <section className="cwf-sec">
        <Head n={5} eyebrow="Questions" title="Asked" em="often." />
        <div className="cwf-faq">
          {copy.faq.map(([q, a]) => (
            <details key={q} className="cwf-plate">
              <summary>{q}<ArrowRight size={14} aria-hidden /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cwf-last">
        <h2 className="cwf-d">Write the <em>last line.</em></h2>
        <p className="cwf-lede">Free to start. Business when you charge.</p>
        <div className="cwf-actions cwf-actions--center">
          <Sticker href={start}>Use CyberWitch</Sticker>
          <Placard href="/themes">See every theme</Placard>
        </div>
      </section>
      <CyberWitchAccentDial />
    </CyberWitchAccentRoot>
  )
}
