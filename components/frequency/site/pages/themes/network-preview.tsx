'use client'

// The Network preview stage (LIVE-1751): the four surfaces of the Network Theme Kit, one chip each, and, when
// asked, a picker for the thirteen profiles. The pictures are renders of the kit's own surfaces
// (public/themes/network-kit/shots). The frames are the design system's: a browser bar for the website and the
// Space, and the iPhone 390 by 844 with a 370 by 824 screen. Server markup shows the first surface, so the
// page reads without script. Tokens only; styles are in network-feature.css.
import Image from 'next/image'
import { useState } from 'react'
import { NETWORK_KITS, NETWORK_SURFACES, networkShot, type NetworkSurface } from '@/lib/themes/network-feature-data'
import './network-feature.css'

export type NetworkSurfaceStatus = 'ready' | 'soon'

const SURFACE_NOTE: Record<NetworkSurface, { ready: string; soon: string }> = {
  site: { ready: 'Your own domain, built from the same blocks.', soon: 'Your own domain, built from the same blocks. On the way.' },
  spotlight: { ready: 'Your link in bio, in the full look.', soon: 'Your link in bio. On the way, so this shows the design.' },
  space: { ready: 'Frequency keeps its frame. The page wears your fonts, your accent and your offers.', soon: 'Frequency keeps its frame, and the page will wear your fonts and accent. On the way.' },
  email: { ready: 'Your list hears from you, and it looks like you.', soon: 'Your list hears from you, and it looks like you. On the way.' },
}
const URL_BAR: Record<'site' | 'space', string> = { site: 'yournetwork.org', space: 'frequency.com/spaces/yournetwork' }

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The design system's iPhone: bezel, status bar with the island and the home bar around a 370 by 824 screen. */
export function NetworkPhone({ src, alt, sizes, priority = false, tone = 'light' }: { src: string; alt: string; sizes: string; priority?: boolean; tone?: 'light' | 'dark' }) {
  return (
    <span className="nf-ios">
      <span className="nf-ios-body">
        <span className="nf-ios-scr">
          <Image src={src} alt={alt} width={740} height={1648} sizes={sizes} priority={priority} />
          <span className={`nf-sb${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true">
            <span>9:41</span>
            <span className="nf-isl" />
            <span className="nf-sbi">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className={`nf-hi${tone === 'dark' ? ' dk' : ''}`} aria-hidden="true" />
        </span>
      </span>
    </span>
  )
}

/** A browser frame around a website or Space picture. */
export function NetworkBrowser({ src, alt, url, width, height, sizes, priority = false }: { src: string; alt: string; url: string; width: number; height: number; sizes: string; priority?: boolean }) {
  return (
    <div className="nf-dv">
      <div className="nf-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <u>{url}</u>
      </div>
      <div className="nf-scr">
        <Image src={src} alt={alt} width={width} height={height} sizes={sizes} priority={priority} />
      </div>
    </div>
  )
}

/** A surface that is on the way (Space, Email): the frame is there, the picture is not, and nothing is invented to fill it. */
export function NetworkSoon({ label, url }: { label: string; url?: string }) {
  const body = (
    <p className="nf-soon-tx">
      <b>{label}</b>
      <small>On the way</small>
    </p>
  )
  if (!url) return <div className="nf-mail nf-soon">{body}</div>
  return (
    <div className="nf-dv">
      <div className="nf-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <u>{url}</u>
      </div>
      <div className="nf-scr nf-soon">{body}</div>
    </div>
  )
}

export function NetworkStage({
  kits = false,
  priority = false,
  status,
  initialKit = 'general',
}: {
  kits?: boolean
  priority?: boolean
  status: Record<NetworkSurface, NetworkSurfaceStatus>
  initialKit?: string
}) {
  const [surface, setSurface] = useState<NetworkSurface>('site')
  const [kitId, setKitId] = useState(initialKit)
  const kit = NETWORK_KITS.find((k) => k.id === kitId) ?? NETWORK_KITS[0]
  const def = NETWORK_SURFACES.find((s) => s.id === surface)!
  const src = def.shot ? networkShot(kit.id, def.shot) : null
  const alt = `Network, ${kit.name}: ${def.label.toLowerCase()}`
  const sizes = '(max-width: 900px) 92vw, 640px'
  return (
    <div className="nf-pv" style={vars({ '--c': kit.hex })}>
      <div className="nf-chips" role="group" aria-label="Surface">
        {NETWORK_SURFACES.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === surface} onClick={() => setSurface(s.id)}>
            {s.label}
            {s.qual ? <small className="nf-q">{s.qual}</small> : null}
          </button>
        ))}
      </div>
      <div className="nf-stage" data-surface={surface}>
        <div className="nf-fit">
          {!src ? (
            <NetworkSoon label={def.label} url={surface === 'space' ? URL_BAR.space : undefined} />
          ) : surface === 'spotlight' ? (
            <NetworkPhone src={src} alt={alt} sizes="(max-width: 900px) 60vw, 280px" priority={priority} />
          ) : (
            <NetworkBrowser src={src} alt={alt} url={URL_BAR.site} width={def.width} height={def.height} sizes={sizes} priority={priority && surface === 'site'} />
          )}
        </div>
      </div>
      <p className="nf-note" aria-live="polite">
        <b>{def.label}.</b> {SURFACE_NOTE[surface][status[surface]]}
      </p>
      {kits ? (
        <div className="nf-kits" role="group" aria-label="Pick a profile">
          {NETWORK_KITS.map((k) => (
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
