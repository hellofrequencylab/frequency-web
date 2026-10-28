'use client'

// /create-a-space, the client island: the hero (kit and accent chips around the live preview) today, the builder
// and its progress meter beside it in the next passes. One state object feeds all of it, so a pick in the hero and
// a pick in the builder are the same pick. The kit arrives as ?kit=<MegaThemeId> from the Theme Kit pages; ?kit=none
// or no param starts on the default look and says "Previewing" (docs: PREVIEW-MODE section 6). Server markup is the cold-traffic render, so the page
// reads without script. Styles: create-space.css.
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense, useState } from 'react'
import type { CSSProperties } from 'react'
import { SpacePreview } from '@/components/frequency/create/space-preview'
import { PREVIEW_KITS, deriveSite, isPreviewKit, kitAccents, kitImagery } from '@/lib/create-space/preview-site'
import type { MegaThemeId } from '@/lib/theme/mega-theme'
import { PREVIEW_FONT_SHEET, previewAccentVars, previewTokens } from '@/lib/theme/preview-tokens'
import './create-space.css'

const COLD_KIT: MegaThemeId = 'frequency'

/** The kit a visit starts on, and whether the visitor arrived having chosen it. Total. */
export function arrivalFromParam(param: string | null): { kit: MegaThemeId; chosen: boolean } {
  if (param && isPreviewKit(param)) return { kit: param, chosen: true }
  return { kit: COLD_KIT, chosen: false }
}

const lightGround = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.4
}

function Hero({ arrival }: { arrival: { kit: MegaThemeId; chosen: boolean } }) {
  const [kit] = useState<MegaThemeId>(arrival.kit)
  const [accentAt, setAccentAt] = useState(0)
  const accents = kitAccents(kit)
  const accent = accents[accentAt] ?? accents[0]
  const label = PREVIEW_KITS.find((k) => k.id === kit)?.label ?? kit
  const tokens = previewTokens(kit)
  const dark = !lightGround(tokens['--pv-bg'])
  const vars = { ...tokens, ...previewAccentVars(accent.fill, accent.text, dark) }
  const site = deriveSite({ name: '', handle: '', hostName: '', intents: [], kit })
  const status = arrival.chosen ? 'Selected' : 'Previewing'
  const chip = vars as CSSProperties
  return (
    <section className="cs-hero" aria-labelledby="cs-h1">
      <link rel="stylesheet" href={PREVIEW_FONT_SHEET} precedence="default" />
      <div className="fq-aura" aria-hidden="true" />
      <div className="cs-hero-in">
        <div className="cs-hero-copy">
          <span className="cs-eyebrow"><span className="cs-dot" />Create a Space</span>
          <h1 id="cs-h1" className="cs-h1">Your whole business, live in <em className="fq-iri-text">12 minutes.</em></h1>
          <p className="cs-lead">You have a practice, a studio, a gathering or a group, and the tools are scattered. Build one home for all of it: your website, Spotlight, bookings and people.</p>
          <div className="cs-ctas">
            <a className="btn fq-iri-btn cs-go" href="#get-started">Start my Free Space<span aria-hidden="true">→</span></a>
            <Link className="cs-link" href="/pricing">Pro pricing</Link>
          </div>
          <div className="cs-fine">
            <p>Free to start. You can change everything later.</p>
            <p>Build it first. You make a free account at the last step.</p>
          </div>
        </div>

        <div className="cs-stage">
          <div className="cs-glow" aria-hidden="true" style={{ background: `radial-gradient(closest-side, ${accent.fill}, transparent)` }} />
          <SpacePreview kit={kit} vars={vars} site={site} imagery={kitImagery(kit)} priority />
          <div className="cs-chip cs-kit" style={chip}>
            <span className="cs-kit-thumb">
              <span className="cs-kit-ring" />
              <span className="cs-kit-img"><Image src={kitImagery(kit).hero} alt="" fill sizes="46px" style={{ objectFit: 'cover', objectPosition: kitImagery(kit).heroPos }} /></span>
            </span>
            <span className="cs-kit-text">
              <span className="cs-kit-status"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>{status}</span>
              <span className="cs-kit-name">{label} <em>kit</em></span>
            </span>
            <a className="cs-change" href="#get-started">Change</a>
          </div>
          <div className="cs-chip cs-accent">
            <span className="cs-accent-label">Accent <span>· {accent.name}</span></span>
            <div role="radiogroup" aria-label="Accent" className="cs-swatches">
              {accents.map((a, i) => (
                <button
                  key={a.name}
                  type="button"
                  role="radio"
                  aria-checked={i === accentAt}
                  aria-label={a.name}
                  className="cs-swatch"
                  style={{ background: a.fill }}
                  onClick={() => setAccentAt(i)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FromUrl() {
  const arrival = arrivalFromParam(useSearchParams().get('kit'))
  return <Hero key={`${arrival.kit}:${arrival.chosen}`} arrival={arrival} />
}

export function CreateSpaceStudio() {
  return (
    <Suspense fallback={<Hero arrival={arrivalFromParam(null)} />}>
      <FromUrl />
    </Suspense>
  )
}
