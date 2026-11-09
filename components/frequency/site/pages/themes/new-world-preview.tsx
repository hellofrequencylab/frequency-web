'use client'

// The New World preview stage (LIVE-2059): the four surfaces of the New World theme, one chip each, and, when
// asked, a picker for the seven kits. The pictures are renders of the kit's own surfaces
// (public/brand/new-world-kit/shots). The frames are the same as the other theme pages: a browser bar for the website and the
// Space, and the iPhone 390 by 844. Server markup shows the first surface, so the
// page reads without script. Tokens only; styles are in new-world-feature.css.
import Image from 'next/image'
import { useState } from 'react'
import { NEW_WORLD_KITS, NEW_WORLD_SURFACES, newWorldShot, type NewWorldSurface } from '@/lib/themes/new-world-feature-data'
import './new-world-feature.css'

export type NewWorldSurfaceStatus = 'ready' | 'soon'

const SURFACE_NOTE: Record<NewWorldSurface, { ready: string; soon: string }> = {
  site: { ready: 'Your own domain, built from the same blocks.', soon: 'Your own domain, built from the same blocks.' },
  spotlight: { ready: 'Your link in bio, in the full look.', soon: 'Your link in bio, in the full look.' },
  space: { ready: 'Frequency keeps its frame. The page wears your fonts, your accent and your offers.', soon: 'Frequency keeps its frame. The page wears your fonts, your accent and your offers.' },
  email: { ready: 'Your list hears from you, and it looks like you.', soon: 'Your list hears from you, and it looks like you.' },
}
const URL_BAR: Record<'site' | 'space', string> = { site: 'yourplace.com', space: 'frequency.com/spaces/yourplace' }

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The design system's iPhone: bezel, status bar with the island and the home bar around a 370 by 824 screen. */
export function NewWorldPhone({ src, alt, sizes, priority = false, tone = 'light' }: { src: string; alt: string; sizes: string; priority?: boolean; tone?: 'light' | 'dark' }) {
  return (
    <span className="nwf-ios">
      <span className="nwf-ios-body">
        <span className="nwf-ios-scr">
          <Image src={src} alt={alt} width={780} height={1688} sizes={sizes} priority={priority} />
          <span className={`nwf-sb${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true">
            <span>9:41</span>
            <span className="nwf-isl" />
            <span className="nwf-sbi">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className={`nwf-hi${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true" />
        </span>
      </span>
    </span>
  )
}

/** A browser frame around a website or Space picture. */
export function NewWorldBrowser({ src, alt, url, width, height, sizes, priority = false }: { src: string; alt: string; url: string; width: number; height: number; sizes: string; priority?: boolean }) {
  return (
    <div className="nwf-dv">
      <div className="nwf-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <u>{url}</u>
      </div>
      <div className="nwf-scr">
        <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} />
      </div>
    </div>
  )
}

/** The email picture in its frame: the template as the list opens it. */
export function NewWorldMail({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  return (
    <div className="nwf-mail">
      <Image src={src} alt={alt} width={900} height={1140} sizes={sizes} />
    </div>
  )
}

export function NewWorldStage({
  kits = false,
  priority = false,
  status,
  initialKit = 'general',
}: {
  kits?: boolean
  priority?: boolean
  status: Record<NewWorldSurface, NewWorldSurfaceStatus>
  initialKit?: string
}) {
  const [surface, setSurface] = useState<NewWorldSurface>('site')
  const [kitId, setKitId] = useState(initialKit)
  const kit = NEW_WORLD_KITS.find((k) => k.id === kitId) ?? NEW_WORLD_KITS[0]
  const def = NEW_WORLD_SURFACES.find((s) => s.id === surface)!
  const src = newWorldShot(kit.id, def.shot)
  const alt = `New World, ${kit.name}: ${def.label.toLowerCase()}`
  const sizes = '(max-width: 900px) 92vw, 640px'
  return (
    <div className="nwf-pv" style={vars({ '--c': kit.hex })}>
      <div className="nwf-chips" role="group" aria-label="Surface">
        {NEW_WORLD_SURFACES.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === surface} onClick={() => setSurface(s.id)}>
            {s.label}
            {s.qual ? <small className="nwf-q">{s.qual}</small> : null}
          </button>
        ))}
      </div>
      <div className="nwf-stage" data-surface={surface}>
        <div className="nwf-fit">
          {surface === 'spotlight' ? (
            <NewWorldPhone src={src} alt={alt} sizes="(max-width: 900px) 60vw, 280px" priority={priority} />
          ) : surface === 'email' ? (
            <NewWorldMail src={src} alt={alt} sizes="(max-width: 900px) 70vw, 420px" />
          ) : (
            <NewWorldBrowser src={src} alt={alt} url={URL_BAR[surface === 'space' ? 'space' : 'site']} width={def.width} height={def.height} sizes={sizes} priority={priority && surface === 'site'} />
          )}
        </div>
      </div>
      <p className="nwf-note" aria-live="polite">
        <b>{def.label}.</b> {SURFACE_NOTE[surface][status[surface]]}
      </p>
      {kits ? (
        <div className="nwf-kits" role="group" aria-label="Pick a kit">
          {NEW_WORLD_KITS.map((k) => (
            <button key={k.id} type="button" aria-pressed={k.id === kit.id} onClick={() => setKitId(k.id)} style={vars({ '--c': k.hex })} title={k.who}>
              <i />
              {k.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
