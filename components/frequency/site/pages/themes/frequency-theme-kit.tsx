// /themes/[theme] on the Frequency design (LIVE-1511): the sales page for one Mega Theme. One template for
// every theme, read from the library catalog, the theme list and the kit index, so a new theme is a new
// catalog entry and not a new page. Sections: full-kit picture, the four places a theme shows up (with what
// is ready today), every tool and look control ("turn on only what you need"), the six starter kits, and
// questions. Built from the template kit only; no page CSS of its own. Copy follows
// docs/marketing/voice-and-language-guide.md. THEME FENCE (ADR-1906): the page says plainly that the Space
// page keeps the Frequency frame and wears fonts and accent only.
import Link from 'next/link'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { OPERATOR_START_HREF } from '@/lib/site'
import { KIT_INDEX } from '@/lib/sites/kits/registry'
import { MEGA_THEMES } from '@/lib/theme/mega-theme'
import { SITE_THEMES } from '@/lib/theme/site-style'
import { THEME_LOOK_CONTROLS, THEME_TOOLS, themeLibraryEntry } from '@/lib/themes/library'
import { ThemePicture } from './theme-picture'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The themes that get this template. Midnight keeps its own richer page at /themes/midnight. */
export const THEME_KIT_PAGE_IDS = SITE_THEMES.map((t) => t.id).filter((id) => id !== 'midnight')

export const THEME_KIT_FAQ: { q: string; a: (name: string) => string }[] = [
  {
    q: 'Do I have to use every tool?',
    a: () => 'No. A kit starts with two or three. Switch on the rest from Menu and features when you are ready, and nothing is lost when you do.',
  },
  {
    q: 'What happens if I change my mind about the look?',
    a: (name) => `Press Change theme in your editor. Your words, offers and photos stay saved. ${name} is only the dress they wear.`,
  },
  {
    q: 'Will my Space page look like my website?',
    a: () => 'Your Space page keeps the Frequency frame so people on the network always know where they are. It wears your fonts, your accent and your offers.',
  },
  {
    q: 'What does it cost?',
    a: () => 'Free to start. Business when you charge.',
  },
]

export function FrequencyThemeKit({ theme }: { theme: string }) {
  const site = SITE_THEMES.find((t) => t.id === theme)
  const entry = themeLibraryEntry(theme)
  if (!site || !entry) return null
  const editor = MEGA_THEMES.find((m) => m.id === theme)?.editor
  const kits = KIT_INDEX.filter((k) => k.theme === editor)
  const name = site.label
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
            <Link href="/themes">Themes</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{name}</span>
          </nav>
          <h1 className="h-xl">
            {name}. <em className="fq-iri-text">{entry.tagline}</em>
          </h1>
          <p>
            Made for {entry.madeFor}. {site.description}
          </p>
          <div className="ctas">
            <a className="btn fq-iri-btn" href={OPERATOR_START_HREF}>
              Use {name}
            </a>
            <Link className="btn btn-ghost fq-iri-rim" href="#kits">
              Pick a starter kit
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href="/themes">
              All themes
            </Link>
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="kit" data-screen-label="02 The kit">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>The whole kit</b>Everything in one look
            </div>
            <h2 className="h-l">Your link page, your site and your emails, all dressed alike.</h2>
            <p className="pb-note">{entry.signature}</p>
          </div>
          <ThemePicture theme={theme} label={name} slot="kit" priority />
        </div>
      </section>

      <section className="sec pb-sec" id="places" data-screen-label="03 Four places">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Four places</b>One look, set once
            </div>
            <h2 className="h-l">Where {name} shows up.</h2>
            <p className="pb-note">
              Change a date, a price or a headline once and every place follows. Your Space page stays the Frequency page people know,
              wearing your fonts and accent.
            </p>
          </div>
          <div className="tg-row two">
            {entry.surfaces.map((s, i) => (
              <div className="tg-card" key={s.id}>
                <p className="label">
                  <b>{`0${i + 1} · ${s.status === 'ready' ? 'Ready' : 'On the way'}`}</b>
                </p>
                <h3>{s.name}</h3>
                <p>{s.carries}</p>
                <ThemePicture theme={theme} label={`${name} ${s.name}`} slot={s.id === 'space' ? 'space' : s.id} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="options" data-screen-label="04 Options">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Every option</b>Turn on only what you need
            </div>
            <h2 className="h-l">Forty features on day one is a month of setup.</h2>
            <p className="pb-note">
              {name} carries every tool Frequency has. Your kit starts with two or three, and the rest are one switch away.
            </p>
          </div>
          <div className="tg-row two">
            {THEME_TOOLS.map((t) => (
              <div className="tg-card" key={t.name}>
                <h3>{t.name}</h3>
                <p>{t.body}</p>
              </div>
            ))}
          </div>
          <div className="sh">
            <h2 className="h-l">Make it yours.</h2>
          </div>
          <div className="tg-row two">
            {THEME_LOOK_CONTROLS.map((c) => (
              <div className="tg-card" key={c.name}>
                <h3>{c.name}</h3>
                <p>{c.options}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="kits" data-screen-label="05 Starter kits">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Starter kits</b>Closest fit first
            </div>
            <h2 className="h-l">Start from the one that sounds like you.</h2>
          </div>
          <div className="tg-row two">
            {kits.map((k) => (
              <div className="tg-card" key={k.id}>
                <h3>{k.label}</h3>
                <p>{k.description}</p>
                <p>
                  <Link href={`/spaces/new?niche=${k.niche}`}>Start with this kit →</Link>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec pb-sec" id="questions" data-screen-label="06 Questions">
        <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.22 })} />
        <div className="wrap">
          <div className="sh">
            <div className="label">
              <b>Questions</b>Before you start
            </div>
            <h2 className="h-l">Good to know.</h2>
          </div>
          <div className="tg-row two">
            {THEME_KIT_FAQ.map((f) => (
              <div className="tg-card" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a(name)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <KeepGoing
        title={`Start with ${name}.`}
        body="Free to start. Business when you charge."
        primary={{ href: OPERATOR_START_HREF, label: `Use ${name} →` }}
        secondary={{ href: '/themes', label: 'See every theme' }}
      />
    </>
  )
}

