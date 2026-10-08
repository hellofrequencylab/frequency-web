import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { imageFocus } from '@/lib/sites/menswork-page'
import { MENSWORK_SEASONS, type MensworkSeason } from '@/lib/theme/menswork'
import { plainInline, safeOverviewHref, type OverviewBlock, type OverviewDoc } from '@/lib/spaces/leadership-overview'
import { Inline } from './overview-inline'
import { ScrollWave } from './scroll-wave'
import { SITE_ADMIN_CSS } from './site-admin-css'

// THE EXECUTIVE OVERVIEW ON THE WEBSITE (LIVE-864): the design system's template
// (templates/executive-overview/ExecutiveOverview.dc.html), drawn from the Space's own overview Markdown
// (lib/spaces/leadership-overview.ts reads it into the template's parts). The header, the sticky contents
// rail with the scroll wave, the Desert Retreat card, the title block over the hero photo and the band,
// then one numbered section per heading. Every word comes from the Space.

export interface SiteOverviewProps {
  brandName: string
  doc: OverviewDoc
  /** The Space's cover photo, under the title. */
  photo: string | null
  /** The overview's author, beside the meta line. */
  author: { name: string; avatar: string | null } | null
  /** The program's retreat, for the rail card. */
  retreat: { title: string; dates: string; href: string } | null
  calendarHref: string
}

export function SiteOverview({ brandName, doc, photo, author, retreat, calendarHref }: SiteOverviewProps) {
  const total = String(doc.sections.length).padStart(2, '0')
  const hero = photo ? imageFocus(photo) : null
  return (
    <div className="hfa">
      <style>{SITE_ADMIN_CSS}</style>
      <header className="hfa-head">
        <div className="hfa-head-in eo">
          <Link className="hfa-brand" href="/">
            <span className="hfa-word">{brandName}</span>
          </Link>
          <nav className="hfa-nav" aria-label="Admin">
            <a className="mono-link" href={calendarHref}>
              Yearly Calendar →
            </a>
          </nav>
        </div>
      </header>
      <div className="eo-body">
        <aside className="eo-rail" data-rail="1">
          <span className="lbl">Contents</span>
          <nav className="eo-toc" aria-label="Contents">
            {doc.sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} data-nav={s.id}>
                <span className="chev" />
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </a>
            ))}
          </nav>
          {retreat && (
            <a className="retreat-card" href={retreat.href}>
              <span className="t">{retreat.title}</span>
              <span className="d">{retreat.dates} →</span>
            </a>
          )}
        </aside>
        <main className="eo-main">
          <div className="eo-hero">
            <h1>
              <span className="h1a">{brandName}</span>
              <span className="h1b">Executive Overview</span>
            </h1>
            {(doc.meta || author) && (
              <div className="eo-meta">
                {doc.meta?.label && <span className="k">{doc.meta.label}</span>}
                {doc.meta?.label && <span className="dia" aria-hidden="true" />}
                <span className="who">
                  {author?.avatar && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={author.avatar} alt={author.name} />
                  )}
                  <span>{doc.meta?.line || author?.name}</span>
                </span>
              </div>
            )}
            {hero?.src && (
              <div className="eo-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hero.src} alt="" style={{ objectPosition: hero.position ?? '58% 60%' }} />
              </div>
            )}
            <div className="band" aria-hidden="true" />
          </div>
          {doc.preamble.length > 0 && (
            <section className="eo-sec">
              <Blocks blocks={doc.preamble} />
            </section>
          )}
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} className={`eo-sec${i === doc.sections.length - 1 && s.blocks.every((b) => b.kind === 'numbered') ? ' small' : ''}`}>
              <span className="kicker lbl">
                <i aria-hidden="true" />
                {String(i + 1).padStart(2, '0')} / {total}
              </span>
              <h2>{s.title}</h2>
              <Blocks blocks={s.blocks} />
            </section>
          ))}
        </main>
      </div>
      <ScrollWave mode="toc" />
    </div>
  )
}

function Blocks({ blocks }: { blocks: OverviewBlock[] }) {
  return blocks.map((b, i) => <Block key={i} block={b} />)
}

function Block({ block: b }: { block: OverviewBlock }): ReactNode {
  switch (b.kind) {
    case 'lede':
      return <p className="lede"><Inline text={b.text} /></p>
    case 'para':
      return <p className="para"><Inline text={b.text} /></p>
    case 'note':
      return <p className="note"><Inline text={b.text} /></p>
    case 'pull':
      return <p className="pull"><Inline text={b.text} /></p>
    case 'link': {
      const href = safeOverviewHref(b.href)
      return href ? (
        <a className="mono-link" href={href} style={{ alignSelf: 'flex-start' }}>
          {plainInline(b.text)}
        </a>
      ) : (
        <p style={{ margin: 0 }}>{plainInline(b.text)}</p>
      )
    }
    case 'callout':
      return (
        <div className="callout">
          <span className="k">{b.label}</span>
          <span className="v"><Inline text={b.text} /></span>
        </div>
      )
    case 'photos':
      return (
        <div className="photos" style={{ gridTemplateColumns: b.images.length === 2 ? 'minmax(0,3fr) minmax(0,2fr)' : `repeat(${b.images.length},minmax(0,1fr))` }}>
          {b.images.map((img, i) => {
            const f = imageFocus(img.src)
            return f.src ? (
              <div key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.src} alt={img.alt} style={{ objectPosition: f.position ?? '50% 50%' }} />
              </div>
            ) : null
          })}
        </div>
      )
    case 'parts':
      return (
        <div className="cards parts">
          {b.items.map((it, i) => (
            <div key={i} className="card">
              <span className="t">{it.title}</span>
              <span className="b"><Inline text={it.text} /></span>
            </div>
          ))}
        </div>
      )
    case 'path':
      return (
        <ol className="path grid1">
          {b.items.map((it, i) => (
            <li key={i} className={it.current ? 'on' : undefined}>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <span className="t">{it.title}</span>
              <span className="b"><Inline text={it.text} /></span>
            </li>
          ))}
        </ol>
      )
    case 'numbered':
      return (
        <ol className="sources">
          {b.items.map((t, i) => <li key={i}><Inline text={t} /></li>)}
        </ol>
      )
    case 'bullets':
      return (
        <ul className="bul">
          {b.items.map((t, i) => <li key={i}><Inline text={t} /></li>)}
        </ul>
      )
    case 'pairs':
      return (
        <div className="pairs">
          {b.groups.map((g, i) => (
            <div key={i}>
              <span className="lbl">{g.label}</span>
              <ul className="bul">
                {g.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}
              </ul>
            </div>
          ))}
        </div>
      )
    case 'aside':
      return (
        <div className="aside">
          <span className="lbl">{b.label}</span>
          {b.text && <p><Inline text={b.text} /></p>}
        </div>
      )
    case 'table':
      return <Table block={b} />
  }
}

function Head({ cells }: { cells: string[] }) {
  return (
    <div className="tr th">
      {cells.map((c, i) => <span key={i}>{plainInline(c)}</span>)}
    </div>
  )
}

function Table({ block: b }: { block: Extract<OverviewBlock, { kind: 'table' }> }) {
  if (b.variant === 'beats') {
    const mid = Math.floor(b.rows.length / 2)
    return (
      <>
        <div className="beats" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${b.rows.length},minmax(0,1fr))` }}>
          {b.rows.map((r, i) => {
            const name = plainInline(r[0] ?? '')
            return (
              <div key={i} className={i === mid ? 'on' : undefined}>
                <b>{name.charAt(0)}</b>
                <span>{name}</span>
              </div>
            )
          })}
        </div>
        <div className="grid1 beat-t">
          <Head cells={b.head.slice(0, 2)} />
          {b.rows.map((r, i) => {
            const name = plainInline(r[0] ?? '')
            return (
              <div key={i} className="tr">
                <span className="k"><em>{name.charAt(0)}</em>{name.slice(1)}</span>
                <span className="t-soft" style={{ font: 'var(--type-body)' }}><Inline text={r.slice(1).join(' ')} /></span>
              </div>
            )
          })}
        </div>
      </>
    )
  }
  if (b.variant === 'seasons') {
    const groups: { name: string; sub: string; rows: string[][] }[] = []
    for (const r of b.rows) {
      if (r[0]?.trim() || !groups.length) {
        const [name, ...rest] = plainInline(r[0] ?? '').split(':')
        groups.push({ name: name.trim(), sub: rest.join(':').trim(), rows: [] })
      }
      groups[groups.length - 1].rows.push(r)
    }
    return (
      <div className="grid1 seasons">
        {groups.map((g, i) => {
          const key = g.name.toLowerCase() as MensworkSeason
          const style = { '--sc': MENSWORK_SEASONS[key] ? `var(--hof-${key})` : 'var(--hof-teal)' } as CSSProperties
          return (
            <div key={i} className="season" style={style}>
              <div className="name">
                <span>
                  <i aria-hidden="true" />
                  <b>{g.name}</b>
                </span>
                {g.sub && <small>{g.sub}</small>}
              </div>
              <div className="list">
                {g.rows.map((r, j) => (
                  <div key={j} className="row">
                    <span className="k">
                      {plainInline(r[1] ?? '')} {r.length > 3 && <em>{plainInline(r[2] ?? '')}</em>}
                    </span>
                    <span className="t-soft"><Inline text={r.slice(r.length > 3 ? 3 : 2).join(' ')} /></span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  if (b.variant === 'levels') {
    return (
      <div className="grid1 level-t" style={{ marginTop: 8 }}>
        <Head cells={b.head.slice(0, 3)} />
        {b.rows.map((r, i) => {
          const loud = /\bretreat\b/i.test(r[1] ?? '')
          const level = plainInline(r[0] ?? '')
          const [main, ...more] = (r[2] ?? '').split(/(?<=\.)\s+(?=[^.]*:)/)
          return (
            <div key={i} className={`tr${loud ? ' loud' : ''}`}>
              <span className={`lv${/^all\b/i.test(level) ? ' all' : ''}`}>{level}</span>
              {loud ? <span className="ev">{plainInline(r[1] ?? '')}</span> : <span className="t-strong"><Inline text={r[1] ?? ''} /></span>}
              <span className="t-soft">
                <Inline text={more.length ? main.replace(/\.$/, '') : (r[2] ?? '')} />
                {more.length > 0 && <small>{more.join(' ').replace(/,\s*/g, ' · ')}</small>}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
  if (b.variant === 'decisions') {
    return (
      <div className="grid1 dec-t">
        {b.rows.map((r, i) => {
          const status = r[1] ?? ''
          const tag = /^(\w+)([.:])\s*(.*)$/.exec(status)
          const isTag = tag && /^(tbd|later|done|open|now)$/i.test(tag[1])
          return (
            <div key={i} className="tr">
              <span className="box" aria-hidden="true" />
              <span className="k">{plainInline(r[0] ?? '')}</span>
              <span className="t-soft">
                {isTag ? (
                  <>
                    <span className={`tag${/^later$/i.test(tag[1]) ? ' later' : ''}`}>{tag[1] + tag[2]}</span> <Inline text={tag[3]} />
                  </>
                ) : (
                  <Inline text={status} />
                )}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
  if (b.variant === 'cards') {
    return (
      <div className="cards rows">
        {b.rows.map((r, i) => (
          <div key={i} className="card">
            <span className="t">{plainInline(r[0] ?? '')}</span>
            {b.head.slice(1).map((h, j) => (
              <span key={j} style={{ display: 'contents' }}>
                <span className="lbl">{plainInline(h)}</span>
                <span className={`v${j === 0 ? ' first' : ''}`}><Inline text={r[j + 1] ?? ''} /></span>
              </span>
            ))}
          </div>
        ))}
      </div>
    )
  }
  const cols = `minmax(0,2fr) ${b.head.slice(1).map(() => 'minmax(0,3fr)').join(' ')}`
  return (
    <div className="grid1 plain-t" style={{ marginTop: 8 }}>
      <div className="tr th" style={{ gridTemplateColumns: cols }}>
        {b.head.map((c, i) => <span key={i}>{plainInline(c)}</span>)}
      </div>
      {b.rows.map((r, i) => (
        <div key={i} className="tr" style={{ gridTemplateColumns: cols }}>
          <span className="t-strong"><Inline text={r[0] ?? ''} /></span>
          {r.slice(1).map((c, j) => <span key={j} className="t-soft"><Inline text={c} /></span>)}
        </div>
      ))}
    </div>
  )
}
