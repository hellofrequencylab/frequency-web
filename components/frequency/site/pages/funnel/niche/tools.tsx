'use client'

// "See it at work" (design section 05): a list of the tools this door uses, and next to it a device card
// showing the selected tool as it looks in a Space. A real tablist (Up and Down move, Home and End jump).
// Every tool's preview is in the page; only the selected one is shown, so the words stay readable by
// crawlers and screen readers.
import { useRef, useState, type ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { toolPreview, type ToolId } from '@/lib/marketing/funnel-design'

export function NicheTools({
  slug,
  tools,
  you,
  kind,
  head,
}: {
  slug: string
  tools: readonly ToolId[]
  you: string
  kind: string
  head: ReactNode
}) {
  const [sel, setSel] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const previews = tools.map((t) => toolPreview(t, slug))

  const move = (to: number) => {
    const i = (to + tools.length) % tools.length
    setSel(i)
    tabs.current[i]?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      move(sel + 1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      move(sel - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(tools.length - 1)
    }
  }

  return (
    <div className="nk-ex">
      <div>
        {head}
        <div
          className="nk-tl"
          role="tablist"
          aria-label="Tools in your Space"
          aria-orientation="vertical"
          onKeyDown={onKey}
        >
          {previews.map((t, i) => (
            <button
              key={tools[i]}
              ref={(el) => {
                tabs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`nk-tab-${i}`}
              aria-selected={sel === i}
              aria-controls={`nk-panel-${i}`}
              tabIndex={sel === i ? 0 : -1}
              onClick={() => setSel(i)}
            >
              <span className="ic">
                <FqIcon name={t.icon} />
              </span>
              <span>
                <b>{t.name}</b>
                <small>{t.sub}</small>
              </span>
              <span className="ar" aria-hidden="true">
                {'→'}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="nk-dev" data-px=".22">
        <span className="rings" aria-hidden="true" />
        <div className="nk-app">
          <div className="top">
            <span className="logo-s" />
            <span>
              <b>{you}</b>
              <small>{kind}</small>
            </span>
          </div>
          {previews.map((t, i) => (
            <div
              key={tools[i]}
              id={`nk-panel-${i}`}
              role="tabpanel"
              aria-labelledby={`nk-tab-${i}`}
              hidden={sel !== i}
              className="bd"
            >
              <h3>{t.title}</h3>
              <p className="sub">{t.lead}</p>
              {t.rows.map((r) => (
                <div key={r[1] + r[2]} className="r">
                  <i className="ri">
                    <FqIcon name={r[0]} />
                  </i>
                  <span>
                    <b>{r[1]}</b>
                    <small>{r[2]}</small>
                  </span>
                  {r[3] && <em className={r[4] ? 'on' : undefined}>{r[3]}</em>}
                </div>
              ))}
              <span className="cta">{t.cta}</span>
            </div>
          ))}
          <div className="ft">frequencylocal.com/your-space</div>
        </div>
      </div>
    </div>
  )
}
