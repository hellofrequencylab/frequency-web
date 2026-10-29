'use client'

// The Designer preview stage (LIVE-1743): the four surfaces of the Designer Theme Kit, one chip each, and, when
// asked, a picker for the thirteen profiles. The pictures are renders of the design system's own kit surfaces
// (public/themes/designer/shots). The frames are the design system's: a browser bar for the website and the
// Space, and the iPhone 390 by 844 with a 370 by 824 screen. Server markup shows the first surface, so the
// page reads without script. Tokens only; styles are in designer-feature.css.
import Image from 'next/image'
import { useState } from 'react'
import { DESIGNER_KITS, DESIGNER_SURFACES, designerShot, type DesignerSurface } from '@/lib/themes/designer-feature-data'
import './designer-feature.css'

export type DesignerSurfaceStatus = 'ready' | 'soon'

const SURFACE_NOTE: Record<DesignerSurface, { ready: string; soon: string }> = {
  site: { ready: 'Your own domain, built from the same blocks.', soon: 'Your own domain, built from the same blocks. On the way.' },
  spotlight: { ready: 'Your link in bio, in the full look.', soon: 'Your link in bio. On the way, so this shows the design.' },
  space: { ready: 'Frequency keeps its frame. The page wears your fonts, your accent and your offers.', soon: 'Frequency keeps its frame. On the way.' },
  email: { ready: 'Your list hears from you, and it looks like you.', soon: 'On the way. This shows the design.' },
}
const URL_BAR: Record<'site' | 'space', string> = { site: 'yourstudio.com', space: 'frequency.com/spaces/yourstudio' }

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The design system's iPhone: bezel, status bar with the island and the home bar around a 370 by 824 screen. */
export function DesignerPhone({ src, alt, sizes, priority = false }: { src: string; alt: string; sizes: string; priority?: boolean }) {
  return (
    <span className="df-ios">
      <span className="df-ios-body">
        <span className="df-ios-scr">
          <Image src={src} alt={alt} width={740} height={1648} sizes={sizes} priority={priority} />
          <span className="df-sb" aria-hidden="true">
            <span>9:41</span>
            <span className="df-isl" />
            <span className="df-sbi">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className="df-hi" aria-hidden="true" />
        </span>
      </span>
    </span>
  )
}

/** A browser frame around a website or Space picture. */
export function DesignerBrowser({ src, alt, url, width, height, sizes, priority = false }: { src: string; alt: string; url: string; width: number; height: number; sizes: string; priority?: boolean }) {
  return (
    <div className="df-dv">
      <div className="df-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <u>{url}</u>
      </div>
      <div className="df-scr">
        <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} />
      </div>
    </div>
  )
}

/** An email picture on its card. */
export function DesignerMail({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  return (
    <div className="df-mail">
      <Image src={src} alt={alt} width={900} height={1140} sizes={sizes} />
    </div>
  )
}

export function DesignerStage({
  kits = false,
  priority = false,
  status,
  initialKit = 'general',
}: {
  kits?: boolean
  priority?: boolean
  status: Record<DesignerSurface, DesignerSurfaceStatus>
  initialKit?: string
}) {
  const [surface, setSurface] = useState<DesignerSurface>('site')
  const [kitId, setKitId] = useState(initialKit)
  const kit = DESIGNER_KITS.find((k) => k.id === kitId) ?? DESIGNER_KITS[0]
  const def = DESIGNER_SURFACES.find((s) => s.id === surface)!
  const src = designerShot(kit.id, def.shot)
  const alt = `Designer, ${kit.name}: ${def.label.toLowerCase()}`
  const sizes = '(max-width: 900px) 92vw, 640px'
  return (
    <div className="df-pv" style={vars({ '--c': kit.hex })}>
      <div className="df-chips" role="group" aria-label="Surface">
        {DESIGNER_SURFACES.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === surface} onClick={() => setSurface(s.id)}>
            {s.label}
            {status[s.id] === 'soon' ? <small>On the way</small> : null}
          </button>
        ))}
      </div>
      <div className="df-stage" data-surface={surface}>
        <div className="df-fit">
          {surface === 'spotlight' ? (
            <DesignerPhone src={src} alt={alt} sizes="(max-width: 900px) 60vw, 280px" priority={priority} />
          ) : surface === 'email' ? (
            <DesignerMail src={src} alt={alt} sizes="(max-width: 900px) 70vw, 420px" />
          ) : (
            <DesignerBrowser src={src} alt={alt} url={URL_BAR[surface]} width={def.width} height={def.height} sizes={sizes} priority={priority && surface === 'site'} />
          )}
        </div>
      </div>
      <p className="df-note" aria-live="polite">
        <b>{def.label}.</b> {SURFACE_NOTE[surface][status[surface]]}
      </p>
      {kits ? (
        <div className="df-kits" role="group" aria-label="Pick a profile">
          {DESIGNER_KITS.map((k) => (
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
