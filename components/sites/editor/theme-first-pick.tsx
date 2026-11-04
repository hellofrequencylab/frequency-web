'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { on } from './skin'

// PICK YOUR LOOK (LIVE-2043): the sheet a website's first editor open shows, before any word is written. One column,
// in the order an owner meets the choices: a theme, its accent and Night or Day, the four global styles, a starter
// kit; the real canvas of the home page on the right. Every control is a part the Theme tab already draws (the
// `.theme` rows, `.swatches`, `.seg` and kit `.row`s), and each pick writes the draft through the Theme tab's own
// handlers, so it is one undo step, it stays a draft, and nothing reaches the live site until the owner publishes.
// The preview is the editor canvas (an iframe of the stand-alone site render), so the theme fence holds.

export interface FirstPickTheme { id: string; label: string; description: string; swatch: CSSProperties; on: boolean }
/** `value` is what the pick stores as the brand colour; null keeps the theme's own accent. */
export interface FirstPickAccent { id: string; label: string; swatch: string; value: string | null; on: boolean }
export interface FirstPickLook { key: string; label: string; options: { id: string; label: string; on: boolean }[] }
export interface FirstPickKit { id: string; label: string; description: string }

export function ThemeFirstPick({ themes, onTheme, accents, onAccent, register, onRegister, looks, onLook, kits, preview, onOpen, onSkip }: {
  themes: FirstPickTheme[]
  onTheme: (id: string) => void
  /** The theme's accents. Fewer than two: the row is not drawn. */
  accents: FirstPickAccent[]
  onAccent: (value: string | null) => void
  /** Night or Day, for a theme with both registers; null hides the choice. */
  register: 'night' | 'day' | null
  onRegister: (value: 'night' | 'day') => void
  looks: FirstPickLook[]
  onLook: (key: string, id: string) => void
  /** The picked theme's starter kits. None: the step is not drawn. */
  kits: FirstPickKit[]
  preview: ReactNode
  /** Close the sheet, applying the chosen kit first when there is one. Resolves to an error to show, or ''. */
  onOpen: (kitId: string | null) => Promise<string>
  onSkip: () => void
}) {
  const [kit, setKit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const picked = themes.find((t) => t.on)
  const kitShown = kit && kits.some((x) => x.id === kit) ? kit : null
  let step = 1
  async function open() {
    setBusy(true)
    const message = await onOpen(kitShown)
    setBusy(false)
    setError(message)
  }
  return <>
    <h2>Pick your look</h2>
    <p className="fp-sub">Pick a theme, a colour, Night or Day, a look and a starter kit, and your site opens already dressed. You can change any of them later in the Theme tab.</p>
    <div className="fp-grid">
      <div className="fp-steps">
        <div className="cap">{step++} · Theme</div>
        <div className="fp-themes">{themes.map((t) => <button type="button" key={t.id} className={`theme${on(t.on)}`} aria-pressed={t.on} onClick={() => onTheme(t.id)}>
          <span className="sw" style={t.swatch} aria-hidden><i data-swatch="bg" /><i data-swatch="accent" /></span><span><b>{t.label}</b><small>{t.description}</small></span></button>)}</div>
        {(accents.length > 1 || register) && <div className="cap">{step++} · {accents.length > 1 && register ? 'Accent and Night or Day' : register ? 'Night or Day' : 'Accent'}</div>}
        {accents.length > 1 && <><div className="swatches" role="group" aria-label="Accent">{accents.map((a) => <button type="button" key={a.id} className={on(a.on).trim() || undefined} aria-pressed={a.on} aria-label={a.label} title={a.label} style={{ background: a.swatch }} onClick={() => onAccent(a.value)} />)}</div>
          <p className="note">{accents.map((a) => a.label).join(' · ')}</p></>}
        {register && <div className="fld"><span className="l">Night or Day</span><div className="seg wrap" role="group" aria-label="Night or Day">{(['night', 'day'] as const).map((v) => <button type="button" key={v} className={on(register === v).trim() || undefined} aria-pressed={register === v} onClick={() => onRegister(v)}>{v === 'night' ? 'Night' : 'Day'}</button>)}</div></div>}
        <div className="cap">{step++} · Look</div>
        {looks.map((l) => <div key={l.key} className="fld"><span className="l">{l.label}</span><div className="seg wrap" role="group" aria-label={l.label}>{l.options.map((o) => <button type="button" key={o.id} className={on(o.on).trim() || undefined} aria-pressed={o.on} onClick={() => onLook(l.key, o.id)}>{o.label}</button>)}</div></div>)}
        {kits.length > 0 && <>
          <div className="cap">{step++} · Starter kit</div>
          <p className="note">A kit gives you pages with sample words to rewrite. Nothing goes live until you publish, and undo takes it back.</p>
          {kits.map((x) => <button type="button" key={x.id} className={`row${on(kitShown === x.id)}`} aria-pressed={kitShown === x.id} onClick={() => setKit(kitShown === x.id ? null : x.id)}><span className="t">{x.label}<small>{x.description}</small></span></button>)}
        </>}
        {error && <p role="alert" className="note err">{error}</p>}
        <div className="acts">
          <button type="button" className="btn sm pa" disabled={busy} onClick={() => void open()}>Open my site</button>
          <button type="button" className="btn sm" disabled={busy} onClick={onSkip}>Skip, use {picked?.label ?? 'this theme'} as is</button>
        </div>
      </div>
      <div className="fp-preview"><div className="cap">Preview · your home page</div><div className="fp-frame">{preview}</div></div>
    </div>
  </>
}
