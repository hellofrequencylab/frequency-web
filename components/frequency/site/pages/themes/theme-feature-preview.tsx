'use client'

// The preview stage for the Default, Bold and Wildheart theme pages: the theme's four surfaces, one chip each, in the same frames as
// /themes/new-world (new-world-preview.tsx). The pictures are renders of the theme's own surfaces under public/brand/theme-pages.
// Server markup shows the first surface, so the page reads without script. Styles: new-world-feature.css, tokens only.
import Image from 'next/image'
import { useState } from 'react'
import { THEME_FEATURE_SURFACES, themeFeatureShot, type ThemeFeatureId, type ThemeFeatureSurface } from '@/lib/themes/theme-feature-data'
import { NewWorldBrowser, NewWorldPhone } from './new-world-preview'

const SURFACE_NOTE: Record<ThemeFeatureSurface, string> = {
  site: 'Your own domain, built from the same blocks.',
  spotlight: 'Your link in bio, in the full look.',
  space: 'Frequency keeps its frame. The page wears your fonts, your accent and your offers.',
  email: 'Your list hears from you, and it looks like you.',
}
const URL_BAR: Record<'site' | 'space', string> = { site: 'yourplace.com', space: 'frequency.com/spaces/yourplace' }

function vars(v: Record<string, string | number>): React.CSSProperties {
  return v as React.CSSProperties
}

/** The email picture in its frame: the message as the list opens it. */
export function ThemeFeatureMail({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  return (
    <div className="nwf-mail nwf-tf">
      <Image src={src} alt={alt} width={900} height={760} sizes={sizes} />
    </div>
  )
}

export function ThemeFeatureStage({ theme, name, priority = false }: { theme: ThemeFeatureId; name: string; priority?: boolean }) {
  const [surface, setSurface] = useState<ThemeFeatureSurface>('site')
  const def = THEME_FEATURE_SURFACES.find((s) => s.id === surface)!
  const src = themeFeatureShot(theme, def.shot)
  const alt = `${name}: ${def.label.toLowerCase()}`
  return (
    <div className="nwf-pv" style={vars({ '--c': 'var(--fq-x-sun-neon)' })}>
      <div className="nwf-chips" role="group" aria-label="Surface">
        {THEME_FEATURE_SURFACES.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === surface} onClick={() => setSurface(s.id)}>
            {s.label}
            {s.qual ? <small className="nwf-q">{s.qual}</small> : null}
          </button>
        ))}
      </div>
      <div className="nwf-stage" data-surface={surface}>
        <div className="nwf-fit">
          {surface === 'spotlight' ? (
            <NewWorldPhone src={src} alt={alt} sizes="(max-width: 900px) 60vw, 280px" priority={priority} />
          ) : surface === 'email' ? (
            <ThemeFeatureMail src={src} alt={alt} sizes="(max-width: 900px) 70vw, 420px" />
          ) : (
            <NewWorldBrowser src={src} alt={alt} url={URL_BAR[surface === 'space' ? 'space' : 'site']} width={def.width} height={def.height} sizes="(max-width: 900px) 92vw, 640px" priority={priority && surface === 'site'} />
          )}
        </div>
      </div>
      <p className="nwf-note" aria-live="polite">
        <b>{def.label}.</b> {SURFACE_NOTE[surface]}
      </p>
    </div>
  )
}
