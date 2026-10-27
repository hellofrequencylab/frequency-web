// /themes on the Frequency design (LIVE-1460): the theme gallery. One card per Mega Theme, read from the
// theme list and the kit index so the page never drifts from what the editor offers. Built from the template
// kit only (phero, sec, sh, tg-card, KeepGoing); no page CSS of its own. Copy follows
// docs/marketing/voice-and-language-guide.md: pain point first, plain words, no claims we cannot stand behind.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { OPERATOR_START_HREF } from '@/lib/site'
import { KIT_INDEX } from '@/lib/sites/kits/registry'
import { MidnightPreview } from './midnight-preview'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { SITE_THEMES } from '@/lib/theme/site-style'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The feature page a theme has, if it has one. Every other theme opens the setup door. */
const THEME_PAGES: Record<string, string> = { midnight: '/themes/midnight' }

export interface ThemeGalleryCard {
  id: string
  label: string
  description: string
  kits: { niche: string; label: string; href: string }[]
  href: string | null
}

/** One card per theme, in the order the editor lists them. */
export const THEME_GALLERY: ThemeGalleryCard[] = SITE_THEMES.map((t) => {
  const editor = MEGA_THEMES.find((m) => m.id === t.id)?.editor
  return {
    id: t.id,
    label: t.label,
    description: t.description,
    kits: KIT_INDEX.filter((k) => k.theme === editor).map((k) => ({ niche: k.niche, label: k.label, href: `/spaces/new?niche=${k.niche}` })),
    href: THEME_PAGES[t.id] ?? null,
  }
})

export function FrequencyThemes() {
  return (
    <>
      <section className="phero big" data-energy="charge" data-screen-label="01 Hero">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/spaces">For Spaces</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Themes</span>
          </nav>
          <h1 className="h-xl">
            Your site should look like you. <em className="fq-iri-text">Pick a feel.</em>
          </h1>
          <p>
            Seven looks for your Spotlight, your Space and your own website. Pick one, change it any time, and your words and photos stay put.
          </p>
          <div className="ctas">
            <a className="btn fq-iri-btn" href={OPERATOR_START_HREF}>
              Start free
            </a>
            <Link className="btn btn-ghost fq-iri-rim" href="/themes/midnight">
              See Midnight
            </Link>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="themes" data-screen-label="02 Themes">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>The themes</b>Seven to start from
            </div>
            <h2 className="h-l">One setup. A look that fits.</h2>
            <p className="pb-note">
              A theme dresses everything at once: website, Space page, emails and event pages. Switching never rewrites what you wrote, and the Change theme button in your editor takes you back.
            </p>
          </div>
          <div className="tg-row two">
            {THEME_GALLERY.map((t) => (
              <div className="tg-card" key={t.id} id={t.id}>
                <h3>{t.label}</h3>
                <p>{t.description}</p>
                {t.kits.length ? (
                  <p>
                    <b>Start from a kit.</b>{' '}
                    {t.kits.map((k, i) => (
                      <span key={k.niche}>
                        {i > 0 && ', '}
                        <Link href={k.href}>{k.label}</Link>
                      </span>
                    ))}
                  </p>
                ) : (
                  <p>
                    <b>Starter kits.</b> Coming soon. Start from the theme and add pages as you go.
                  </p>
                )}
                <p>
                  {t.href ? <Link href={t.href}>See {t.label} →</Link> : <a href={OPERATOR_START_HREF}>Start with {t.label} →</a>}
                </p>
                {t.id === 'midnight' && <MidnightPreview />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title="Start with your Spotlight."
        body="Free to start. Pick a theme now or change it later."
        primary={{ href: OPERATOR_START_HREF, label: 'Start free →' }}
        secondary={{ href: '/pricing', label: 'See every plan' }}
      />
    </>
  )
}
