'use client'

import { useState } from 'react'

// THE DESIGNER TESTIMONIAL CAROUSEL (design: the Home testimonials). One quote at a time with dots and
// previous / next buttons. The slides are server-built and passed in as nodes, so the quotes are real content in
// the page; with one slide the controls do not render.

export function DesignerCarousel({ head, slides }: { head: React.ReactNode; slides: React.ReactNode[] }) {
  const [i, setI] = useState(0)
  const n = slides.length
  if (n === 0) return null
  return (
    <>
      <div className="dz-tbar">
        {head}
        {n > 1 && (
        <div className="dz-tctl">
          <div className="dz-dots">
            {slides.map((_, k) => (
              <button key={k} type="button" className="dz-dot" aria-label={`Testimonial ${k + 1}`} aria-current={k === i} onClick={() => setI(k)} />
            ))}
          </div>
          <button type="button" className="dz-round" aria-label="Previous" onClick={() => setI((i + n - 1) % n)}>←</button>
          <button type="button" className="dz-round" aria-label="Next" onClick={() => setI((i + 1) % n)}>→</button>
        </div>
        )}
      </div>
      <div className="dz-slides" data-count={n}>
        {slides.map((s, k) => (
          <div key={k} className="dz-slide" hidden={k !== i}>{s}</div>
        ))}
      </div>
    </>
  )
}
