// /themes on the Frequency design (LIVE-1460, rebuilt LIVE-1511): the theme library index. Two columns, one
// card per Mega Theme with its full-kit picture, read from the theme list, the library catalog and the kit
// index so the page never drifts from what the editor offers. Built from the template kit only (phero, sec,
// sh, tg-card, KeepGoing); no page CSS of its own. Copy follows docs/marketing/voice-and-language-guide.md:
// pain point first, plain words, no claims we cannot stand behind.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { OPERATOR_START_HREF } from '@/lib/site'
import { KIT_INDEX } from '@/lib/sites/kits/registry'
import { ThemePicture } from './theme-picture'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { SITE_THEMES } from '@/lib/theme/site-style'
import { THEME_LIBRARY } from '@/lib/themes/library'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

export interface ThemeGalleryCard {
  id: string
  label: string
  tagline: string
  description: string
  kits: { niche: string; label: string; href: string }[]
  href: string
}

/** One card per theme, in the order the editor lists them. */
export const THEME_GALLERY: ThemeGalleryCard[] = SITE_THEMES.map((t) => {
  const editor = MEGA_THEMES.find((m) => m.id === t.id)?.editor
  return {
    id: t.id,
    label: t.label,
    tagline: THEME_LIBRARY.find((l) => l.id === t.id)?.tagline ?? t.description,
    description: t.description,
    kits: KIT_INDEX.filter((k) => k.theme === editor).map((k) => ({ niche: k.niche, label: k.label, href: `/spaces/new?niche=${k.niche}` })),
    href: `/themes/${t.id}`,
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
            Seven looks for your Spotlight, your website and your emails, each one complete. Start with the tools you need and turn on
            the rest later.
          </p>
          <div className="ctas">
            <a className="btn fq-iri-btn" href={OPERATOR_START_HREF}>
              Start free
            </a>
            <Link className="btn btn-ghost fq-iri-rim" href="#themes">
              See the themes
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
              Every theme comes complete. Pick the feel, then switch on only the tools you need. Your words and photos stay put if you
              change your mind, and the Change theme button in your editor takes you back.
            </p>
          </div>
          <div className="tg-row two">
            {THEME_GALLERY.map((t) => (
              <div className="tg-card" key={t.id} id={t.id}>
                <Link href={t.href} aria-label={`See the ${t.label} kit`}>
                  <ThemePicture theme={t.id} label={t.label} slot="kit" />
                </Link>
                <h3>{t.label}</h3>
                <p>{t.tagline}</p>
                <p>
                  <b>{t.kits.length} starter kits.</b> {t.description}
                </p>
                <p>
                  <Link href={t.href}>See the {t.label} kit →</Link>
                </p>
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
