'use client'
// ONE ACCENT on the CyberWitch theme page (owner, 2026-11-05: "set it in one place and see it wherever"). A visitor picks
// one of the five neons and the whole page follows: the root's data-accent re-points every --cw-flare-* token, the hero
// photo and the four surface pictures swap to that neon's renders (public/brand/theme-pages/cyberwitch/<accent>/, made by
// scripts/render/theme-pages-shots with CW_ACCENT). The pick is remembered on this device only.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import Image, { type ImageProps } from 'next/image'
import Link from 'next/link'
import { CYBERWITCH_ACCENTS, type CyberWitchAccentId } from '@/lib/theme/cyberwitch'

const IDS = Object.keys(CYBERWITCH_ACCENTS) as CyberWitchAccentId[]
const KEY = 'cw-theme-page-accent'
const Ctx = createContext<{ accent: CyberWitchAccentId; set: (a: CyberWitchAccentId) => void }>({ accent: 'hex', set: () => {} })

/** The picture a surface shows in a neon: Hex is the default set, the others sit in a folder of their own. */
export const cyberwitchShot = (accent: CyberWitchAccentId, shot: string) => `/brand/theme-pages/cyberwitch/${accent === 'hex' ? '' : `${accent}/`}${shot}.jpg`

// The pick lives in this device's storage (a per-viewer convenience), with a module copy when storage is off. Read through
// useSyncExternalStore so the server and the first paint agree on Hex and the saved neon arrives right after.
let memory: CyberWitchAccentId | null = null
const listeners = new Set<() => void>()
const isAccent = (v: unknown): v is CyberWitchAccentId => typeof v === 'string' && v in CYBERWITCH_ACCENTS
/** The neon this device picked last, on this page or the Theme Kits page; null when it never picked one. */
function readPicked(): CyberWitchAccentId | null {
  try {
    const saved = window.localStorage.getItem(KEY)
    if (isAccent(saved)) return saved
  } catch { /* storage off */ }
  return memory
}
const readAccent = (): CyberWitchAccentId => readPicked() ?? 'hex'
/** Remember a neon for this device: the theme page, the Theme Kits page and both Use buttons read it. */
export function writeAccent(a: CyberWitchAccentId) {
  memory = a
  try { window.localStorage.setItem(KEY, a) } catch { /* storage off */ }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** The neon this device picked, for the Theme Kits page's CyberWitch section; null until one is picked. */
export function useCyberWitchPick(): CyberWitchAccentId | null {
  return useSyncExternalStore(subscribe, readPicked, () => null)
}

/** The page root: carries the theme and the picked neon. */
export function CyberWitchAccentRoot({ className, children }: { className: string; children: ReactNode }) {
  const accent = useSyncExternalStore(subscribe, readAccent, () => 'hex' as CyberWitchAccentId)
  const set = writeAccent
  return (
    <Ctx.Provider value={{ accent, set }}>
      <div data-house-theme="cyberwitch" data-accent={accent} className={className}>{children}</div>
    </Ctx.Provider>
  )
}

/** A picture that follows the neon: a surface render (`shot`) or the theme's hero photo. */
export function CyberWitchAccentImage({ shot, hero, ...props }: Omit<ImageProps, 'src'> & { shot?: string; hero?: boolean }) {
  const { accent } = useContext(Ctx)
  const src = hero ? `/sites/cyberwitch/photos/hero-${accent}.jpg` : cyberwitchShot(accent, shot ?? 'site')
  return <Image key={src} src={src} {...props} alt={props.alt} />
}

/** The five neon tags as buttons: pressing one dresses the whole page in it. */
export function CyberWitchAccentTags() {
  const { accent, set } = useContext(Ctx)
  return (
    <ul className="cwf-tags">
      {IDS.map((id) => (
        <li key={id} data-house-theme="cyberwitch" data-accent={id}>
          <button type="button" className="cwf-tagbtn" aria-pressed={accent === id} onClick={() => set(id)}>
            <span className="cwf-tag">{CYBERWITCH_ACCENTS[id].label}</span>
            <span className="cwf-label">{CYBERWITCH_ACCENTS[id].meaning}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The design's dial: a small fixed plate with the five neons, so the pick is in reach from anywhere on the page. */
export function CyberWitchAccentDial() {
  const { accent, set } = useContext(Ctx)
  return (
    <div className="cwf-dial" role="group" aria-label="Pick a neon">
      <span className="cwf-label">Neon</span>
      <span className="cwf-dial-sw">
        {IDS.map((id) => (
          <button key={id} type="button" data-house-theme="cyberwitch" data-accent={id} aria-pressed={accent === id} aria-label={CYBERWITCH_ACCENTS[id].label} title={CYBERWITCH_ACCENTS[id].label} onClick={() => set(id)} />
        ))}
      </span>
      <b className="cwf-dial-name">{CYBERWITCH_ACCENTS[accent].label}</b>
    </div>
  )
}

/** A link into the builder that carries the picked neon (&accent=, lib/create-space/door.ts), so the Space starts in it. */
export function CyberWitchUseLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const { accent } = useContext(Ctx)
  return <Link href={`${href}${href.includes('?') ? '&' : '?'}accent=${accent}`} className={className}>{children}</Link>
}
