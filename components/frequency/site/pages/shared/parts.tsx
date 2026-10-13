// Markup pieces the four lane-A bodies share, written in the "site" kit's own class names
// (app/themes/frequency/kit-site.css) so the kit styles them as the design does.

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import type { SiteEvent, SiteSpace } from './data'

export interface Act {
  href: string
  icon: FqIconName
  title: string
  sub: string
}

/** The `.acts` stack under a chapter: icon tile, title + one line, arrow. */
export function Acts({ items, className }: { items: Act[]; className?: string }) {
  return (
    <div className={className ? `acts ${className}` : 'acts'}>
      {items.map((a) => (
        <Link key={a.title} href={a.href}>
          <span className="ic">
            <FqIcon name={a.icon} />
          </span>
          <span>
            <b>{a.title}</b>
            <small>{a.sub}</small>
          </span>
          <span className="ar" aria-hidden="true">
            →
          </span>
        </Link>
      ))}
    </div>
  )
}

/** The `.chap` band: rings behind, a two-column split (photo or map on one side). */
export function Chapter({
  label,
  rev,
  children,
}: {
  label: string
  rev?: boolean
  children: ReactNode
}) {
  return (
    <div className="chap" data-screen-label={label}>
      <span className="rings" data-px="-.12" aria-hidden="true" />
      <div className={rev ? 'wrap split rev' : 'wrap split'}>{children}</div>
    </div>
  )
}

/** A chapter photo with the iridescent rim. */
export function ChapPhoto({ src, alt, sheen, className }: { src: string; alt: string; sheen?: boolean; className?: string }) {
  return (
    <div className={sheen ? 'photo fq-iri-sheen fq-iri-rim' : 'photo fq-iri-rim'} data-px=".08">
      {/* eslint-disable-next-line @next/next/no-img-element -- the kit sizes .photo img itself (object-fit cover) */}
      <img loading="lazy" decoding="async" className={className} src={src} alt={alt} />
    </div>
  )
}

const PHOTOS = '/brand/frequency/photos'
export const photo = (name: string) => `${PHOTOS}/${name}`

/**
 * THE MAP, AS ITS LIST. The design mounts a Leaflet map on `[data-fqmap]` (web/eventmap.js) with a list
 * panel over it. Leaflet is not a dependency here, and public events and Spaces expose a city only,
 * never a coordinate, so there is nothing honest to pin. What renders is the same `.fqm` shell with the
 * list panel filled from real data, server-side, with no client JS at all.
 */
export function WhatsOnList({
  mode,
  title,
  events,
  spaces,
  ok,
  style,
  emptyHref,
}: {
  mode: 'people' | 'spaces'
  title: string
  events?: SiteEvent[]
  spaces?: SiteSpace[]
  ok: boolean
  style?: CSSProperties
  emptyHref: string
}) {
  const sp = mode === 'spaces'
  const count = sp ? (spaces?.length ?? 0) : (events?.length ?? 0)
  return (
    <div className="fqm pa-static" data-fqmap={mode} style={style}>
      <div className="fqm-map" aria-hidden="true">
        <span className="rings" />
      </div>
      <aside className="fqm-list" aria-label={title}>
        <div className="fqm-top">
          <span className="fqm-live">
            <i />
            {sp ? 'Ranked by gathering' : 'What’s happening'}
          </span>
          <b>{title}</b>
        </div>
        <div className="fqm-items">
          {count === 0 && (
            <p className="fqm-note">
              {ok ? (
                <>
                  {sp ? 'No Spaces are listed yet. ' : 'Nothing is on the calendar yet. '}
                  <Link href={emptyHref}>{sp ? 'Open the first one.' : 'Host the first one.'}</Link>
                </>
              ) : (
                'The calendar is taking a moment to load.'
              )}
            </p>
          )}
          {sp
            ? spaces?.map((s) => (
                <Link key={s.id} className="fqm-it" href={s.href}>
                  <span className="ic">
                    <FqIcon name="space" />
                  </span>
                  <span className="tx">
                    <small>#{s.rank}</small>
                    <b>{s.name}</b>
                    {s.where && <em>{s.where}</em>}
                  </span>
                  <i>{s.tag}</i>
                </Link>
              ))
            : events?.map((e) => (
                <Link key={e.id} className="fqm-it" href={e.href}>
                  <span className="ic">
                    <FqIcon name={e.icon} />
                  </span>
                  <span className="tx">
                    <small>{e.when}</small>
                    <b>{e.title}</b>
                    {e.where && <em>{e.where}</em>}
                  </span>
                  <i>{e.tag}</i>
                </Link>
              ))}
        </div>
      </aside>
    </div>
  )
}

/** The location pill. The design's "San Diego · 48 Circles and events this week" becomes the city the
 *  calendar is busiest in and a real seven-day count; with no city it is left out. */
export function LocPill({ href, city, line }: { href: string; city: string | null; line: string | null }) {
  if (!city) return null
  return (
    <Link className="locpill" href={href}>
      <FqIcon name="pin" />
      <b>{city}</b>
      {line && <span>{line}</span>}
      <em>Change</em>
    </Link>
  )
}

/** The page-end "Keep going" band. The shell lane owns the shared Keep going component; this is the
 *  design's markup for it, kept here so each body is whole until that component lands. */
export function KeepGoing({
  label,
  title,
  body,
  primary,
  secondary,
}: {
  label: string
  title: string
  body: string
  primary: { href: string; label: string }
  secondary: { href: string; label: string }
}) {
  return (
    <section className="sec kg" data-screen-label={label}>
      <div className="wrap">
        <div className="next2" data-energy="charge">
          <div className="fq-aura" style={aura(0.55)} />
          <span className="rings" aria-hidden="true" />
          <div className="n2t">
            <span className="k">Keep going</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
          <div className="ctas">
            <Link className="btn fq-iri-btn" href={primary.href}>
              {primary.label}
            </Link>
            <Link className="btn btn-ghost fq-iri-rim" href={secondary.href}>
              {secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/** `--fq-aura-opacity` for a `.fq-aura` layer (the design's inline `--aura-opacity`). */
export const aura = (opacity: number) => ({ '--fq-aura-opacity': opacity }) as CSSProperties
