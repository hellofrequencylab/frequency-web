'use client'

// The Temple preview stage (LIVE-1870): the four surfaces of the Temple Theme Kit, one chip each, and, when
// asked, a picker for the thirteen profiles. The pictures are renders of the kit's own surfaces
// (public/themes/temple-kit/shots). The frames are the design system's: a browser bar for the website and the
// Space, and the iPhone 390 by 844 with a 370 by 824 screen. Server markup shows the first surface, so the
// page reads without script. Tokens only; styles are in temple-feature.css.
import Image from 'next/image'
import { useState } from 'react'
import { TEMPLE_KITS, TEMPLE_SURFACES, templeShot, type TempleSurface } from '@/lib/themes/temple-feature-data'
import './temple-feature.css'

export type TempleSurfaceStatus = 'ready' | 'soon'

const SURFACE_NOTE: Record<TempleSurface, { ready: string; soon: string }> = {
  site: { ready: 'Your own domain, built from the same blocks.', soon: 'Your own domain, built from the same blocks. On the way.' },
  spotlight: { ready: 'Your link in bio, in the full look.', soon: 'Your link in bio. On the way, so this shows the design.' },
  space: { ready: 'Frequency keeps its frame. The page wears your fonts, your accent and your offers.', soon: 'Frequency keeps its frame, and the page will wear your fonts and accent. On the way.' },
  email: { ready: 'Your list hears from you, and it looks like you.', soon: 'Your list hears from you, and it looks like you. On the way.' },
}
const URL_BAR: Record<'site' | 'space', string> = { site: 'yourtemple.org', space: 'frequency.com/spaces/yourtemple' }

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The design system's iPhone: bezel, status bar with the island and the home bar around a 370 by 824 screen. */
export function TemplePhone({ src, alt, sizes, priority = false, tone = 'light' }: { src: string; alt: string; sizes: string; priority?: boolean; tone?: 'light' | 'dark' }) {
  return (
    <span className="tf-ios">
      <span className="tf-ios-body">
        <span className="tf-ios-scr">
          <Image src={src} alt={alt} width={740} height={1648} sizes={sizes} priority={priority} />
          <span className={`tf-sb${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true">
            <span>9:41</span>
            <span className="tf-isl" />
            <span className="tf-sbi">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className={`tf-hi${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true" />
        </span>
      </span>
    </span>
  )
}

/** A browser frame around a website or Space picture. */
export function TempleBrowser({ src, alt, url, width, height, sizes, priority = false }: { src: string; alt: string; url: string; width: number; height: number; sizes: string; priority?: boolean }) {
  return (
    <div className="tf-dv">
      <div className="tf-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <u>{url}</u>
      </div>
      <div className="tf-scr">
        <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} />
      </div>
    </div>
  )
}

/** The email picture in its frame: the template as the list opens it. */
export function TempleMail({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  return (
    <div className="tf-mail">
      <Image src={src} alt={alt} width={900} height={1140} sizes={sizes} />
    </div>
  )
}

export function TempleStage({
  kits = false,
  priority = false,
  status,
  initialKit = 'general',
}: {
  kits?: boolean
  priority?: boolean
  status: Record<TempleSurface, TempleSurfaceStatus>
  initialKit?: string
}) {
  const [surface, setSurface] = useState<TempleSurface>('site')
  const [kitId, setKitId] = useState(initialKit)
  const kit = TEMPLE_KITS.find((k) => k.id === kitId) ?? TEMPLE_KITS[0]
  const def = TEMPLE_SURFACES.find((s) => s.id === surface)!
  const src = templeShot(kit.id, def.shot)
  const alt = `Temple, ${kit.name}: ${def.label.toLowerCase()}`
  const sizes = '(max-width: 900px) 92vw, 640px'
  return (
    <div className="tf-pv" style={vars({ '--c': kit.hex })}>
      <div className="tf-chips" role="group" aria-label="Surface">
        {TEMPLE_SURFACES.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === surface} onClick={() => setSurface(s.id)}>
            {s.label}
            {s.qual ? <small className="tf-q">{s.qual}</small> : null}
          </button>
        ))}
      </div>
      <div className="tf-stage" data-surface={surface}>
        <div className="tf-fit">
          {surface === 'spotlight' ? (
            <TemplePhone src={src} alt={alt} sizes="(max-width: 900px) 60vw, 280px" priority={priority} />
          ) : surface === 'email' ? (
            <TempleMail src={src} alt={alt} sizes="(max-width: 900px) 70vw, 420px" />
          ) : (
            <TempleBrowser src={src} alt={alt} url={URL_BAR[surface === 'space' ? 'space' : 'site']} width={def.width} height={def.height} sizes={sizes} priority={priority && surface === 'site'} />
          )}
        </div>
      </div>
      <p className="tf-note" aria-live="polite">
        <b>{def.label}.</b> {SURFACE_NOTE[surface][status[surface]]}
      </p>
      {kits ? (
        <div className="tf-kits" role="group" aria-label="Pick a profile">
          {TEMPLE_KITS.map((k) => (
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
