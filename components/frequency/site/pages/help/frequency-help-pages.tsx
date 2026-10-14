// The help center's INNER pages on the Frequency design: a topic (/help/<category>), an article
// (/help/<category>/<slug>), "What's new" (/help/changelog), the not-found and the loading state.
// Help.html draws only the front page (the Stage search hero); everything below it is a HELP CENTER:
// the index on the left, the reading on the right (owner, 2026-10-13: "supposed to be in a help center
// with the index on the left and content area on the right").
//
// LAYOUT (`.hc`, site-pages-b.css). Two columns on desktop. LEFT, a sticky index: the search box, every
// topic with the current one open on its articles (the current page marked `aria-current`), What's new
// and Contact support. RIGHT, the page: a compact breadcrumb, the heading at the section scale (not the
// front page's display size), the updated date, the body in a ~68ch reading measure, "On this page"
// for an article with three or more sections, then the previous and next articles. On a phone the
// index folds into a "Help topics" disclosure above the page. The topics come from the same data the
// DAWN sidebar read (getAllCategories, helpHref), so every route, article id and anchor is unchanged.
//
// SURFACE. Every page here sits on COMMONS, the light reading room (lib/frequency/site-pages.ts, the
// help row's `innerSurface`; guidelines/site-themes.md: "never put long reading on Stage"). Only the
// front page (/help) is Stage. No request data is read: the current page comes from the route params
// the page already has, so every page stays static.
//
// READING IDIOM. `.hp-prose` (site-pages-b.css) dresses the plain elements HelpMarkdown renders in
// `bare` mode; inside the help center `.hc-body` tunes it for reading (callouts, table heads at the
// 13px floor). The routes, the article ids, the JSON-LD and the markdown source are unchanged.
import Link from 'next/link'
import '@/app/themes/active/site-pages-b'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { getAllCategories, helpHref } from '@/lib/help/content'
import { helpToc } from '@/lib/help/toc'
import { HelpIndexSearch, type HelpIndexEntry } from './help-client'

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

type Crumb = { href?: string; label: string }

/** Where the reader is, for the index: a topic, an article in a topic, or What's new. */
type HelpPlace = { category: string; article?: string } | { changelog: true }

// ── The index (left column) ─────────────────────────────────────────────────────────────────────

interface IndexTopic {
  slug: string
  title: string
  articles: { slug: string; title: string; href: string }[]
}

function TopicList({ topics, place }: { topics: IndexTopic[]; place: HelpPlace }) {
  const currentTopic = 'category' in place ? place.category : null
  const currentArticle = 'category' in place ? place.article : undefined
  const onChangelog = 'changelog' in place
  return (
    <>
      <ul className="hc-cats">
        {topics.map((t) => {
          const open = t.slug === currentTopic
          return (
            <li key={t.slug} className={open ? 'is-open' : undefined}>
              <Link href={`/help/${t.slug}`} aria-current={open && !currentArticle ? 'page' : undefined}>
                {t.title}
              </Link>
              {open && t.articles.length > 0 && (
                <ul className="hc-arts">
                  {t.articles.map((a) => (
                    <li key={a.slug}>
                      <Link href={a.href} aria-current={a.slug === currentArticle ? 'page' : undefined}>
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <ul className="hc-more">
        <li>
          <Link href="/help/changelog" aria-current={onChangelog ? 'page' : undefined}>
            What’s new
          </Link>
        </li>
        <li>
          <Link href="/help">Help home</Link>
        </li>
        <li>
          <Link href="/help#contact">Contact support</Link>
        </li>
      </ul>
    </>
  )
}

/** The help center frame: the index beside the page, folded above it on a phone. */
async function HelpCenterFrame({ place, children }: { place: HelpPlace; children: React.ReactNode }) {
  const topics: IndexTopic[] = (await getAllCategories()).map((c) => ({
    slug: c.slug,
    title: c.title,
    articles: c.articles.map((a) => ({ slug: a.slug, title: a.title, href: helpHref(c.slug, a.slug) })),
  }))
  const entries: HelpIndexEntry[] = topics.flatMap((t) => t.articles.map((a) => ({ title: a.title, topic: t.title, href: a.href })))
  const currentTitle =
    'changelog' in place ? 'What’s new' : (topics.find((t) => t.slug === place.category)?.title ?? 'Help topics')

  return (
    <div className="wrap hc" data-screen-label="01 Help center">
      <aside className="hc-side" aria-label="Help center">
        <HelpIndexSearch entries={entries} />
        <nav aria-label="Help topics">
          <TopicList topics={topics} place={place} />
        </nav>
      </aside>
      <details className="hc-mob">
        <summary>
          <span>
            <small>Help topics</small>
            {currentTitle}
          </span>
          <span className="hc-chev" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="hc-mob-in">
          <HelpIndexSearch entries={entries} />
          <nav aria-label="Help topics">
            <TopicList topics={topics} place={place} />
          </nav>
        </div>
      </details>
      <div className="hc-main">{children}</div>
    </div>
  )
}

/** The page head inside the help center: a compact breadcrumb, the heading, a lead and a meta line. */
function HelpHead({ crumbs, title, lead, meta }: { crumbs: Crumb[]; title: string; lead?: string; meta?: React.ReactNode }) {
  return (
    <header className="hc-head">
      <nav className="crumbs hc-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="hp-crumb">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
          </span>
        ))}
      </nav>
      <h1 className="hc-h1">{title}</h1>
      {lead && <p className="hc-lead">{lead}</p>}
      {meta && <p className="hp-meta">{meta}</p>}
    </header>
  )
}

/** The quiet door to a person, at the foot of a page. */
function StillStuckLine() {
  return (
    <p className="hc-stuck">
      Still stuck? <Link href="/help#contact">Write to us</Link>. A real person reads every message.
    </p>
  )
}

export interface HelpArticleLink {
  title: string
  description: string
  href: string
}

/** /help/<category>: the topic's articles, in the help center. */
export function FrequencyHelpCategory({
  slug,
  title,
  description,
  articles,
}: {
  slug: string
  title: string
  description: string
  articles: HelpArticleLink[]
}) {
  return (
    <HelpCenterFrame place={{ category: slug }}>
      <HelpHead
        crumbs={[{ href: '/help', label: 'Help' }, { label: title }]}
        title={title}
        lead={description}
        meta={`${articles.length} ${articles.length === 1 ? 'article' : 'articles'}`}
      />
      <div className="qa hc-list">
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
      <StillStuckLine />
    </HelpCenterFrame>
  )
}

/** /help/<category>/<slug>: one article in the help center's reading column. */
export function FrequencyHelpArticle({
  slug,
  title,
  description,
  body,
  updated,
  category,
  prev,
  next,
}: {
  slug: string
  title: string
  description: string
  body: string
  updated: string
  category: { slug: string; title: string }
  prev: { title: string; href: string } | null
  next: { title: string; href: string } | null
}) {
  const toc = helpToc(body)
  return (
    <HelpCenterFrame place={{ category: category.slug, article: slug }}>
      <article className="hc-article">
        <HelpHead
          crumbs={[{ href: '/help', label: 'Help' }, { href: `/help/${category.slug}`, label: category.title }]}
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
        {toc.length >= 3 && (
          <nav className="hc-toc" aria-label="On this page">
            <p>On this page</p>
            <ol>
              {toc.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="hc-body">
          <HelpMarkdown bare>{body}</HelpMarkdown>
        </div>
        {(prev || next) && (
          <nav className="hp-pn hc-pn" aria-label="More in this topic">
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
        <StillStuckLine />
      </article>
    </HelpCenterFrame>
  )
}

/** /help/changelog: the public changelog, in the help center's reading column. */
export function FrequencyHelpChangelog({ body }: { body: string }) {
  return (
    <HelpCenterFrame place={{ changelog: true }}>
      <HelpHead
        crumbs={[{ href: '/help', label: 'Help' }, { label: 'What’s new' }]}
        title="What’s new"
        lead="Recent changes and improvements to Frequency."
      />
      <div className="hc-body">
        <HelpMarkdown bare>{body}</HelpMarkdown>
      </div>
    </HelpCenterFrame>
  )
}

/** The help hero, for the not-found: crumbs, a heading and a lead. */
function HelpHero({ crumbs, title, lead }: { crumbs: Crumb[]; title: React.ReactNode; lead?: string }) {
  return (
    <section className="hp-hero hp-inner" data-energy="still" data-screen-label="01 Help">
      {/* Commons: the aura low and nothing else (site-themes: "Hero areas only, low opacity"). */}
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
      </div>
    </section>
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
