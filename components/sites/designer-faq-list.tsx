'use client'

import { useState } from 'react'

// THE DESIGNER QUESTIONS (design: FAQItem). One answer open at a time, the first open to begin with; the answer's
// height animates through grid-template-rows (0fr to 1fr), not a native <details>. The answers are in the page
// either way, so a reader without script still finds them (the panels are only visually folded).

export function DesignerFaqList({ items }: { items: { q: string; a: string; list: string[] }[] }) {
  const [open, setOpen] = useState(0)
  return (
    <div className="dz-faq">
      {items.map((f, i) => {
        const on = open === i
        return (
          <div key={i} className="dz-faq-item" data-open={on ? '' : undefined}>
            <button type="button" className="dz-faq-q" aria-expanded={on} aria-controls={`dz-faq-${i}`} onClick={() => setOpen(on ? -1 : i)}>
              <span>{f.q}</span>
              <span className="dz-plus" aria-hidden="true">+</span>
            </button>
            <div className="dz-faq-panel" id={`dz-faq-${i}`} role="region">
              <div>
                <div className="dz-faq-answer">
                  <p className="dz-body">{f.a}</p>
                  {f.list.length > 0 && (
                    <ol className="dz-rows">
                      {f.list.map((name, k) => <li key={k}><b aria-hidden="true">{k + 1}</b>{name}</li>)}
                    </ol>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
