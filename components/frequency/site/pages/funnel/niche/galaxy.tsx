'use client'

// "Your Space" galaxy (design section 02): You at the centre, three dashed rings, six planets at fixed
// hex positions. A planet is a button; it opens a small note card above (or below) it saying what that tool
// does and which tool of the Space it is. Esc, a click outside or the close button closes it. The notes
// are also in the page as a plain list for readers who never open the card.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { PLANET_NOTES, PLANET_POSITIONS, planetIcon } from '@/lib/marketing/funnel-design'

export function NicheGalaxy({ planets, caption }: { planets: readonly string[]; caption: string }) {
  const box = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [below, setBelow] = useState(false)

  const place = useCallback(() => {
    const m = box.current
    const p = pop.current
    if (!m || !p || open === null) return
    const btn = m.querySelectorAll<HTMLElement>('.nk-planet')[open]
    const sp = btn?.querySelector<HTMLElement>('.nk-sp3')
    if (!btn || !sp) return
    const mr = m.getBoundingClientRect()
    const sr = sp.getBoundingClientRect()
    const pw = p.offsetWidth
    const ph = p.offsetHeight
    const cx = sr.left - mr.left + sr.width / 2
    let x = cx - pw / 2
    let y = sr.top - mr.top - ph - 16
    x = Math.max(-12, Math.min(mr.width - pw + 12, x))
    const flip = y < -40
    if (flip) y = btn.getBoundingClientRect().bottom - mr.top + 14
    setBelow(flip)
    p.style.left = `${x}px`
    p.style.top = `${y}px`
    p.style.setProperty('--fq-ax', `${cx - x}px`)
  }, [open])

  useEffect(() => {
    if (open === null) return
    place()
    const out = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.nk-planet') && !t.closest('.nk-gpop')) setOpen(null)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('click', out)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('click', out)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  const name = open === null ? '' : planets[open]
  const note = PLANET_NOTES[name] ?? ['', '']

  return (
    <figure className="nk-mwrap" data-px=".12">
      <div
        ref={box}
        className="nk-mess"
        role="group"
        aria-label="You at the centre, with the tools of your Space around you"
      >
        <span className="nk-gal3">
          <span className="nk-rg r1" />
          <span className="nk-rg r2" />
          <span className="nk-rg r3" />
          {planets.map((p, i) => {
            const pos = PLANET_POSITIONS[i]
            return (
              <button
                key={p}
                type="button"
                className="nk-planet"
                aria-haspopup="dialog"
                aria-expanded={open === i ? true : undefined}
                onClick={() => setOpen(open === i ? null : i)}
                style={
                  {
                    left: `${pos[0]}%`,
                    top: `${pos[1]}%`,
                    '--fq-z': `${pos[2]}px`,
                  } as CSSProperties
                }
              >
                <span className="nk-sp3" />
                <span className="nk-lb3">{p}</span>
              </button>
            )
          })}
          <span
            ref={pop}
            className={`nk-gpop${below ? ' below' : ''}`}
            role="dialog"
            aria-label={name || 'Tool note'}
            hidden={open === null}
          >
            <span className="hd">
              <span className="gic">
                <FqIcon name={planetIcon(note[1])} />
              </span>
              <strong className="gt">{name}</strong>
              <button type="button" className="x" aria-label="Close" onClick={() => setOpen(null)}>
                {'×'}
              </button>
            </span>
            <span className="gd">{note[0]}</span>
            <span className="to">
              <span className="gk">In your Space</span>
              <span className="gv">{note[1]}</span>
            </span>
            <span className="tip" />
          </span>
          <span className="nk-core3">
            <span className="nk-ball3" />
            <b>You</b>
            <em>at the centre</em>
          </span>
        </span>
      </div>
      <figcaption className="nk-cap">{caption}</figcaption>
      <ul className="sr-only">
        {planets.map((p) => (
          <li key={p}>
            {p}: {PLANET_NOTES[p]?.[0]}
          </li>
        ))}
      </ul>
    </figure>
  )
}
