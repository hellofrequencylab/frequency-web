// The help center's INNER pages on the Frequency design: a topic (/help/<category>), an article
// (/help/<category>/<slug>), "What's new" (/help/changelog), the not-found and the loading state.
// Help.html draws only the front page; these extend it in the kit's own idiom so the whole help
// center reads as one place: the `.hp-hero` (crumbs, a display heading, the aura and rings), then the
// content on the page canvas, then the "Still stuck? Write to us." band pointing at the front page's
// contact form.
//
// SURFACE. Every page here sits on COMMONS, the light reading room (lib/frequency/site-pages.ts, the help
// row's `innerSurface`; owner 2026-10-14, "light for articles"): only the front page (/help) is Stage. The
// reading column is the one the legal pages already wear on Commons (legal-reading.tsx), and SiteShell's
// Commons rules turn the side colour deep for links, list markers and the quote rule (site-shell.css).
//
// READING IDIOM. An article is the help center's long read, so its body is the kit's reading column:
// `.hp-prose` (site-pages-b.css) dresses the plain elements HelpMarkdown renders in `bare` mode,
// with the kit's display face for headings, body colour and measure for paragraphs, the side colour
// for links, and the `.mx` table's lines for GFM tables. The routes, the article ids, the JSON-LD and
// the markdown source are unchanged.
import Link from 'next/link'
import '@/app/themes/active/site-pages-b'
import { HelpMarkdown } from '@/components/help/help-markdown'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

type Crumb = { href?: string; label: string }

/** The help hero, shrunk for an inner page: crumbs, a heading, an optional lead and a meta line. */
function HelpHero({
  crumbs,
  title,
  lead,
  meta,
  size = 'l',
}: {
  crumbs: Crumb[]
  title: React.ReactNode
  lead?: string
  meta?: React.ReactNode
  size?: 'l' | 'm'
}) {
  return (
    <section className={`hp-hero hp-inner${size === 'm' ? ' hp-m' : ''}`} data-energy="still" data-screen-label="01 Help">
      {/* Commons: the aura low and nothing else (site-themes: "Hero areas only, low opacity"); the rings
          and the grain are Stage's, drawn in light lines that vanish on the sand canvas. */}
      <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.18 })} />
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="hp-crumb">
              {i > 0 && <span aria-hidden="true">/</span>}
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
        <h1 className="h-xl">{title}</h1>
        {lead && <p className="hp-lead">{lead}</p>}
        {meta && <p className="hp-meta">{meta}</p>}
      </div>
    </section>
  )
}

/** The front page's contact band, as a door back to it. */
function StillStuck() {
  return (
    <section className="sec" style={{ paddingTop: 0 }} data-screen-label="Contact">
      <div className="wrap">
        <div className="band">
          <div>
            <span className="k">Still stuck?</span>
            <h3>Write to us.</h3>
            <p>A real person reads every message.</p>
          </div>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href="/help#contact">
              Write to us
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href="/help">
              Help home
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export interface HelpArticleLink {
  title: string
  description: string
  href: string
}

/** /help/<category>: the topic's articles, as the front page's rows. */
export function FrequencyHelpCategory({
  title,
  description,
  articles,
}: {
  title: string
  description: string
  articles: HelpArticleLink[]
}) {
  return (
    <>
      <HelpHero crumbs={[{ href: '/', label: 'Home' }, { href: '/help', label: 'Help' }, { label: title }]} title={title} lead={description} />
      <section className="sec" style={{ paddingTop: 0 }} data-screen-label="02 Articles">
        <div className="wrap">
          <div className="hp-g">
            <div>
              <h2>{`${articles.length} ${articles.length === 1 ? 'article' : 'articles'}`}</h2>
              <p className="hp-d">
                <Link href="/help">Every topic →</Link>
              </p>
            </div>
            <div className="qa">
              {articles.map((a) => (
                <Link key={a.href} className="hp-a" href={a.href}>
                  <span>
                    <b>{a.title}</b>
                    {a.description && <small>{a.description}</small>}
                  </span>
                  <span className="ar" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
      <StillStuck />
    </>
  )
}

/** /help/<category>/<slug>: one article in the kit's reading column. */
export function FrequencyHelpArticle({
  title,
  description,
  body,
  updated,
  category,
  prev,
  next,
}: {
  title: string
  description: string
  body: string
  updated: string
  category: { slug: string; title: string }
  prev: { title: string; href: string } | null
  next: { title: string; href: string } | null
}) {
  return (
    <>
      <HelpHero
        size="m"
        crumbs={[
          { href: '/', label: 'Home' },
          { href: '/help', label: 'Help' },
          { href: `/help/${category.slug}`, label: category.title },
        ]}
        title={title}
        lead={description}
        meta={
          updated ? (
            <>
              Updated <time dateTime={updated}>{updated}</time>
            </>
          ) : undefined
        }
      />
      <section className="sec hp-read" style={{ paddingTop: 0 }} data-screen-label="02 Article">
        <div className="wrap">
          <article className="hp-col">
            <HelpMarkdown bare>{body}</HelpMarkdown>
            {updated && (
              <p className="hp-meta hp-foot">
                Last updated <time dateTime={updated}>{updated}</time>
              </p>
            )}
            {(prev || next) && (
              <nav className="hp-pn" aria-label="More in this topic">
                {prev ? (
                  <Link href={prev.href}>
                    <small>Previous</small>
                    <b>← {prev.title}</b>
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link className="nx" href={next.href}>
                    <small>Next</small>
                    <b>{next.title} →</b>
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </article>
        </div>
      </section>
      <StillStuck />
    </>
  )
}

/** /help/changelog: the public changelog, in the same reading column. */
export function FrequencyHelpChangelog({ body }: { body: string }) {
  return (
    <>
      <HelpHero
        crumbs={[{ href: '/', label: 'Home' }, { href: '/help', label: 'Help' }, { label: 'What’s new' }]}
        title={
          <>
            What’s <em className="fq-iri-text">new.</em>
          </>
        }
        lead="Recent changes and improvements to Frequency."
      />
      <section className="sec hp-read" style={{ paddingTop: 0 }} data-screen-label="02 Changelog">
        <div className="wrap">
          <article className="hp-col">
            <HelpMarkdown bare>{body}</HelpMarkdown>
          </article>
        </div>
      </section>
      <StillStuck />
    </>
  )
}

/** The help center's not-found, in the hero's dress. */
export function FrequencyHelpNotFound() {
  return (
    <>
      <HelpHero
        crumbs={[{ href: '/', label: 'Home' }, { href: '/help', label: 'Help' }, { label: 'Not found' }]}
        title={
          <>
            We couldn’t find <em className="fq-iri-text">that article.</em>
          </>
        }
        lead="It may have moved, or the link’s broken. Search the help home, or write to us."
      />
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="ctas">
            <Link className="btn fq-iri-btn" href="/help">
              Help home
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href="/help#contact">
              Write to us
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

/** The loading state: the hero's frame with the heading held, so nothing jumps when the page lands. */
export function FrequencyHelpLoading() {
  return (
    <section className="hp-hero hp-inner" aria-busy="true" aria-label="Loading help">
      <div className="fq-aura" style={vars({ '--fq-aura-opacity': 0.3 })} />
      <span className="rings" aria-hidden="true" />
      <div className="wrap">
        <div className="hp-skel" style={{ width: 160, height: 14 }} />
        <div className="hp-skel" style={{ width: 'min(520px,80%)', height: 56, marginTop: 24 }} />
        <div className="hp-skel" style={{ width: 'min(640px,90%)', height: 18, marginTop: 24 }} />
      </div>
    </section>
  )
}
