'use client'

// THE KIT PICKER on the Midnight feature page (LIVE-1383): choose the closest kit and see what the same site
// record puts on each of the three surfaces. Choices are plain data computed on the server (no kit code ships
// to the browser); buttons and cards are the template kit's own classes.
import { useState } from 'react'

export interface MidnightKitChoice {
  niche: string
  label: string
  description: string
  headline: string
  pages: string[]
}

export function MidnightKitPicker({ choices }: { choices: MidnightKitChoice[] }) {
  const [niche, setNiche] = useState(choices[0]?.niche ?? '')
  const pick = choices.find((c) => c.niche === niche) ?? choices[0]
  if (!pick) return null
  return (
    <div>
      <div className="ctas" role="group" aria-label="Pick a kit">
        {choices.map((c) => (
          <button key={c.niche} type="button" className="btn btn-ghost fq-iri-rim" aria-pressed={c.niche === pick.niche} onClick={() => setNiche(c.niche)}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="pb-note" aria-live="polite">
        {pick.description}
      </p>
      <div className="tg-row two">
        <div className="tg-card">
          <p className="label">
            <b>01 · Spotlight</b>
          </p>
          <h3>{pick.headline}</h3>
          <p>One main button at the top. Nocturne in full.</p>
        </div>
        <div className="tg-card">
          <p className="label">
            <b>02 · Space</b>
          </p>
          <h3>{pick.headline}</h3>
          <p>On Frequency, wearing your fonts, accent and offers.</p>
        </div>
        <div className="tg-card">
          <p className="label">
            <b>03 · Website</b>
          </p>
          <h3>{pick.headline}</h3>
          <p>Your own domain. Pages: {pick.pages.join(', ')}.</p>
        </div>
      </div>
    </div>
  )
}
