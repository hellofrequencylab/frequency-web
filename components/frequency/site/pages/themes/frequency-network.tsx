// /themes/network (LIVE-1751, rebuilt LIVE-1790): the feature page for the Network Theme Kit, in the section order
// and shape of the Theme Feature Page of the Network design system (docs/design-systems/network): 01 Hero (the four
// surfaces flow down the hero), 03 Today, 04 Theme preview, 05 Inside the kit, 06 Make it yours, 07 Thirteen kits,
// 08 What carries over, 09 Built right, 10 Questions, 11 Setup, 12 Start. Server component; the pieces that follow the
// picked profile are client islands in network-preview.tsx, inside one provider. Every picture is a render of the
// kit's own surfaces (real chrome, blocks, Space page and mailer) under public/themes/network-kit. What is ready and
// what is on the way is read from the theme library catalog (lib/themes/library.ts), so the page never says more than
// the product does. The design page's live iframes, full-screen preview chrome and draft builder are replaced by the
// pictures, a picture preview and the Create a Space wizard. Copy follows docs/marketing/voice-and-language-guide.md.
// Styles: network-feature.css, tokens only.
import Link from 'next/link'
import { FreeSpotlightButton } from '@/components/marketing/free-spotlight-button'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import '@/app/themes/active/site-pages-b'
import { themeLibraryEntry } from '@/lib/themes/library'
import { type NetworkSurface } from '@/lib/themes/network-feature-data'
import {
  NetworkAccent,
  NetworkCustomise,
  NetworkGallery,
  NetworkHeroFlow,
  NetworkInside,
  NetworkInsideName,
  NetworkPreviewHost,
  NetworkStartActions,
  NetworkStartKits,
  NetworkStartLink,
  NetworkTry,
  type NetworkSurfaceStatus,
} from './network-preview'

const BEFORE: [string, string][] = [
  ['Link in bio', 'Points away to everything else'],
  ['Event tool', 'Its own brand on your RSVPs'],
  ['Payments app', 'A receipt that does not look like you'],
  ['Email list', 'A separate list, a separate look'],
  ['Website builder', 'Your copy, written a second time'],
]
const AFTER: [string, string][] = [
  ['Spotlight', 'RSVPs and joins on the page'],
  ['Space', 'Found on the network, wearing your look'],
  ['Website', 'Your own domain, same blocks'],
  ['Email', 'Four templates, your list, your face'],
  ['One profile', 'One login, one list, one look'],
]

const CARRY: { row: string; cells: (string | true)[] }[] = [
  { row: 'Name and mark', cells: [true, true, true, true] },
  { row: 'Fonts and accent', cells: [true, 'On Frequency’s frame', true, true] },
  { row: 'Offers, dates and prices', cells: [true, true, true, 'The next few'] },
  { row: 'Headline and copy', cells: [true, 'Tagline', true, 'Opening line'] },
  { row: 'Main button', cells: [true, true, true, true] },
  { row: 'Accessible color and controls', cells: [true, true, true, true] },
]

const CRAFT: [string, string, string][] = [
  ['Color', 'Contrast-checked ramps', 'Four schemes, each with a hero color that carries its own label and a text step that reads on paper. Buttons, links and labels meet contrast guidelines out of the box.'],
  ['Input', 'Keyboard and screen readers', 'Every button, tab, menu and form across all four surfaces is reachable, focusable and labelled.'],
  ['Email', 'Survives real inboxes', 'Templates are built in tables with inline styles and email-safe fallbacks for your display face.'],
  ['Data', 'Your people stay yours', 'Members, RSVPs and check-ins land in your contacts. Export them any time.'],
]

const SETUP: [string, string, string][] = [
  ['01', 'Choose a kit', 'Pick the closest of the thirteen. The preview updates as you choose.'],
  ['02', 'Name and tools', 'Keep the kit’s tools or add more: meetups, membership, programs, one-to-ones, shop.'],
  ['03', 'Your look', 'Keep the kit’s scheme or pick another. Set corners, spacing and header.'],
  ['04', 'Go live', 'Your Spotlight is live today. Space, website and emails switch on with a Business account, or wait as a draft.'],
]

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

export function FrequencyNetwork() {
  const entry = themeLibraryEntry('network-kit')
  if (!entry) return null
  const statusOf = (id: string) => entry.surfaces.find((s) => s.id === id)?.status ?? 'soon'
  const status: Record<NetworkSurface, NetworkSurfaceStatus> = {
    site: statusOf('website'),
    spotlight: statusOf('spotlight'),
    // Space and Email are pictures of the real page and mailer, but the product does not offer them on this theme
    // yet, so they read as on the way here whatever the catalog says: this page shows less than the product, never more.
    space: 'soon',
    email: 'soon',
  }

  return (
    <>
      <div className="nf" style={vars({ '--c': 'var(--fq-x-sun-neon)' })}>
        <section className="nf-hero" data-energy="flow" data-screen-label="01 Hero">
          <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.35 })} />
          <div className="fq-grain" />
          <div className="wrap">
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <Link href="/spaces">For spaces</Link>
              <span aria-hidden="true">/</span>
              <Link href="/themes">Themes</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Network</span>
            </nav>
            <div className="nf-top">
              <div className="label">
                <b>Theme Kit</b>Network · by Frequency
              </div>
              <h1 className="nf-h1">
                Design it once.
                <br />
                <em className="fq-iri-text">Same theme everywhere.</em>
              </h1>
              <p className="nf-lead">
                One complete theme for networking groups and the organizations that keep them together. Your link in bio, your Space on Frequency, your own
                website and your emails, all reading one profile. Change it once and every surface marked ready follows.
              </p>
              <div className="ctas">
                <NetworkStartLink className="btn fq-iri-btn">Start your Spotlight</NetworkStartLink>
                <a className="btn btn-ghost fq-iri-rim" href="#preview">
                  See it live
                </a>
                <FreeSpotlightButton surface="theme" detail="network" />
              </div>
            </div>
            <NetworkHeroFlow status={status} />
          </div>
        </section>

        <section className="sec nf-body" id="body" aria-label="About the theme">
          <div className="nf-part" id="why" data-screen-label="03 Today">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Today</b>Where a networking group lives online
                </div>
                <h2 className="h-l">Five tools. Five logins. Five versions of you.</h2>
              </div>
              <div className="nf-stack">
                <div className="nf-st-card before">
                  <span className="label">Before · five tools</span>
                  {BEFORE.map(([a, b]) => (
                    <div className="nf-row" key={a}>
                      <span>
                        <i />
                        {a}
                      </span>
                      <em>{b}</em>
                    </div>
                  ))}
                  <p className="nf-st-p">
                    Each one is fine on its own. Together they drift: a price changes in one place and not the others, and every hand-off is a place to lose
                    someone.
                  </p>
                </div>
                <span className="nf-arrow" aria-hidden="true">
                  →
                </span>
                <NetworkAccent className="nf-st-card after">
                  <span className="label">With a Theme Kit · one profile</span>
                  {AFTER.map(([a, b]) => (
                    <div className="nf-row" key={a}>
                      <span>
                        <i />
                        {a}
                      </span>
                      <em>{b}</em>
                    </div>
                  ))}
                  <p className="nf-st-p">
                    Change a meetup time, a tier or a headline once. The surfaces marked ready follow, and everyone who signs up lands in the same list.
                  </p>
                </NetworkAccent>
              </div>
            </div>
          </div>

          <div className="nf-part" id="preview" data-screen-label="04 Theme preview">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Theme preview</b>See it live
                </div>
                <h2 className="h-l">Try it on before you choose.</h2>
                <p className="nf-sh-p">Pick a kit. Switch surfaces. Every picture is the Network kit reading one profile.</p>
              </div>
              <NetworkTry />
            </div>
          </div>

          <div className="nf-part" id="inside" data-screen-label="05 Inside the kit">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Inside the kit</b>Everything a kit ships with
                </div>
                <h2 className="h-l">More than a homepage.</h2>
                <p className="nf-sh-p">
                  Every kit is a complete site, not a template. Pages, home blocks with layout variants, the tools behind them, four emails, and a scheme tuned to
                  the kind of network. Shown here for <NetworkInsideName />.
                </p>
              </div>
              <NetworkInside />
            </div>
          </div>

          <div className="nf-part" id="yours" data-screen-label="06 Make it yours">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Make it yours</b>Keep the kit, change the look · <span className="nf-soon-tag">Coming soon</span>
                </div>
                <h2 className="h-l">Your accent. Your face. Your corners.</h2>
                <p className="nf-sh-p">
                  A kit is a starting point. Change the accent, the display face or the corner radius and every surface updates together. Hero colors are
                  checked for contrast on paper and under their label before they go live.
                </p>
              </div>
              <NetworkCustomise />
            </div>
          </div>

          <div className="nf-part" id="kits" data-screen-label="07 Thirteen kits">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Thirteen profiles</b>Each tuned to one kind of network
                </div>
                <h2 className="h-l">
                  See it. Preview it. <em className="fq-iri-text nf-plain">Make it yours.</em>
                </h2>
              </div>
              <NetworkGallery />
              <p className="nf-foot">Every picture is the real theme. Switch kits any time; your words, offers and dates stay.</p>
            </div>
          </div>

          <div className="nf-part" id="carry" data-screen-label="08 What carries over">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>What carries over</b>Change it once
                </div>
                <h2 className="h-l">One profile. Every surface follows.</h2>
              </div>
              <div className="nf-cmp" role="table" aria-label="What carries to each surface">
                <div className="hd" />
                <div className="hd">Spotlight</div>
                <div className="hd">Space</div>
                <div className="hd">Website</div>
                <div className="hd">Email</div>
                {CARRY.map((r) => (
                  <div className="nf-cmp-row" key={r.row}>
                    <div className="rw">{r.row}</div>
                    {r.cells.map((c, i) =>
                      c === true ? (
                        <div className="y" key={i}>
                          <span className="vh">Carries in full</span>
                        </div>
                      ) : (
                        <div className="p" key={i}>
                          <span>{c}</span>
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </div>
              <p className="nf-legend">
                <i className="y" aria-hidden="true" />
                Carries in full<i className="p" aria-hidden="true" />
                Carries, adapted to the surface
              </p>
            </div>
          </div>

          <div className="nf-part" id="craft" data-screen-label="09 Built right">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Built right</b>Accessible, send-ready, yours
                </div>
                <h2 className="h-l">The parts you should never have to think about.</h2>
              </div>
              <div className="nf-setup nf-craft">
                {CRAFT.map(([n, t, b]) => (
                  <div key={n}>
                    <span className="n">{n}</span>
                    <b>{t}</b>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="nf-part" id="questions" data-screen-label="10 Questions">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Questions</b>Before you start
                </div>
                <h2 className="h-l">Good to know.</h2>
              </div>
              <div className="nf-faq">
                <details open>
                  <summary>Can I start with only a Spotlight?</summary>
                  <p>Yes. Most people do. Your Space and website use the same profile, so they are ready when you are, with nothing to rewrite.</p>
                </details>
                <details>
                  <summary>Will my Space look exactly like my website?</summary>
                  <p>
                    Your Space keeps Frequency’s page frame, so people on the network always know where they are. It wears your name, fonts, accent and
                    offers, so it reads as you.
                  </p>
                </details>
                <details>
                  <summary>Do I need every tool on day one?</summary>
                  <p>No. Each kit starts with two to four. Turn on meetups, membership, programs, one-to-ones or the shop when you are ready to run them.</p>
                </details>
                <details>
                  <summary>What happens to my content if I switch kits?</summary>
                  <p>
                    Tools, block order, look and the kit’s starter words reset to the new kit. Your own text, offers and dates stay saved on their blocks. A
                    block that the new kit hides keeps its content and returns as you left it.
                  </p>
                </details>
                <details>
                  <summary>Who owns my contacts?</summary>
                  <p>You do. Sign-ups, RSVPs and check-ins build your list, and your list stays yours.</p>
                </details>
                <details>
                  <summary>What does it cost?</summary>
                  <p>
                    Free to start. Business when you charge. <Link href="/pricing">See pricing</Link>.
                  </p>
                </details>
              </div>
            </div>
          </div>

          <div className="nf-part" id="steps" data-screen-label="11 Setup">
            <div className="wrap">
              <div className="sh">
                <div className="label">
                  <b>Setup</b>Four steps
                </div>
                <h2 className="h-l">Live in an afternoon.</h2>
              </div>
              <div className="nf-setup">
                {SETUP.map(([n, t, b]) => (
                  <div key={n}>
                    <span className="n">{n}</span>
                    <b>{t}</b>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div data-screen-label="12 Start" className="nf-start">
          <KeepGoing
            id="start"
            kicker="Start here"
            title={
              <>
                Start your Spotlight.
                <br />
                <em>Choose a theme.</em>
              </>
            }
            body="Pick the kit closest to your network. Your Spotlight is live today; your Space, website and emails are ready when you are. Free to start."
            primary={{ href: '/spaces/new?theme=network-kit', label: 'Start with Business' }}
            slot={<NetworkStartKits />}
            actions={<NetworkStartActions />}
          />
        </div>
      </div>
      <NetworkPreviewHost />
    </>
  )
}
