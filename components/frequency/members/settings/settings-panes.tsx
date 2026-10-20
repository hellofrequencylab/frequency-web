'use client'

import { useEffect, useRef, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { Input } from '@/components/ui/field'

// The Settings pane switcher (design_handoff/frequency/templates/members/Settings.html): a side list
// on the left, one pane on the right. Every pane is server-rendered and stays MOUNTED (hidden with the
// kit's `.hide`), so a form half-filled in one pane survives a look at another and every section's
// own Suspense boundary streams as before. The URL hash is the deep link, and the old anchors
// (#billing, #plan, #connections, #profile ...) still land on the pane that now holds them.

export interface SettingsPane {
  key: string
  label: string
  /** Older in-page anchors this pane answers to (the DAWN suite's section ids). */
  anchors: string[]
  content: React.ReactNode
}

function paneForHash(panes: SettingsPane[], hash: string): string | null {
  const id = hash.replace(/^#/, '')
  if (!id) return null
  return panes.find((p) => p.key === id || p.anchors.includes(id))?.key ?? null
}

export function SettingsPanes({ panes, initial }: { panes: SettingsPane[]; initial: string }) {
  const [active, setActive] = useState(initial)
  const [q, setQ] = useState('')
  const [words, setWords] = useState<Record<string, string>>({})
  const panesRef = useRef<HTMLDivElement>(null)

  // Search settings: a pane matches on its name or anything written in it. Every pane stays mounted
  // (hidden, not removed), so its text is in the DOM; it is read as the box is typed in, because a
  // section streams in behind its own Suspense boundary and may not be there at first paint.
  function search(next: string) {
    const text: Record<string, string> = {}
    panesRef.current?.querySelectorAll('section[id]').forEach((el) => {
      text[el.id] = (el.textContent ?? '').toLowerCase()
    })
    setWords(text)
    setQ(next)
  }
  const needle = q.trim().toLowerCase()
  const matching = needle
    ? panes.filter(
        (p) =>
          p.label.toLowerCase().includes(needle) ||
          p.anchors.some((a) => a.toLowerCase().includes(needle)) ||
          (words[p.key] ?? '').includes(needle),
      )
    : panes

  // Follow the hash: on arrival (an old deep link) and on back/forward. Reading location.hash is an
  // external-system sync, which is exactly what an effect is for.
  useEffect(() => {
    const sync = () => {
      const key = paneForHash(panes, window.location.hash)
      if (key) setActive(key)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [panes])

  function choose(key: string) {
    setActive(key)
    try {
      window.history.replaceState(null, '', `#${key}`)
    } catch {
      /* a sandboxed frame without history: the pane still switches */
    }
  }

  return (
    <div className="w-full min-w-0">
    <form
      className="fqm-find mc-bottom-24"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        if (matching[0]) choose(matching[0].key)
      }}
    >
      <FqIcon name="search" />
      <Input variant="seamless" type="search" value={q} onChange={(e) => search(e.target.value)} placeholder="Search settings" aria-label="Search settings" autoComplete="off" />
    </form>
    <div className="ap-cols l">
      <aside className="side">
        <nav className="stack sel mc-gap-2" aria-label="Settings sections">
          {matching.length === 0 ? <p className="t2">No setting matches “{q.trim()}”.</p> : null}
          {matching.map((p) => (
            <button
              key={p.key}
              type="button"
              className={p.key === active ? 'mc-navbtn on' : 'mc-navbtn'}
              aria-current={p.key === active ? 'page' : undefined}
              onClick={() => choose(p.key)}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </aside>
      <div ref={panesRef}>
        {panes.map((p) => (
          <section
            key={p.key}
            id={p.key}
            className={p.key === active ? 'panel stack mc-pane' : 'panel stack mc-pane hide'}
            aria-label={p.label}
          >
            {p.content}
          </section>
        ))}
      </div>
    </div>
    </div>
  )
}
