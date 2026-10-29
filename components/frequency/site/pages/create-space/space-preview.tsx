// The live preview of a Space: its website in a browser frame and its Spotlight in a phone, in whichever Theme Kit
// the visitor picked. PURE: tokens and site in, markup out (no state, no data). It reads only the --pv-* contract
// of lib/theme/preview-tokens.ts, so a kit that declares the contract is supported with no change here. Sized in
// container units, so it scales to any width. Styles: create-space.css (cs-pv-*).
import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { KitImagery, PreviewSite } from '@/lib/create-space/preview-site'
import type { MegaThemeId } from '@/lib/theme/mega-theme'

export interface SpacePreviewProps {
  kit: MegaThemeId
  /** The --pv-* tokens of the kit plus the runtime accent trio. */
  vars: Record<string, string>
  site: PreviewSite
  imagery: KitImagery
  /** Hero pictures load first when the preview sits above the fold. */
  priority?: boolean
  className?: string
}

const asStyle = (v: Record<string, string>) => v as CSSProperties
const HERO_SIZES = '(min-width: 1280px) 520px, 90vw'
const PORTRAIT_SIZES = '(min-width: 1280px) 240px, 40vw'
const STRIP_SIZES = '(min-width: 1280px) 220px, 40vw'

function Photo({ src, pos, sizes, priority }: { src: string; pos?: string; sizes: string; priority?: boolean }) {
  return <Image src={src} alt="" fill sizes={sizes} priority={priority} style={{ objectFit: 'cover', objectPosition: pos ?? 'center' }} />
}

export function SpacePreview({ kit, vars, site, imagery, priority = false, className }: SpacePreviewProps) {
  return (
    <div
      className={`cs-pv${className ? ` ${className}` : ''}`}
      data-preview-theme={kit}
      style={asStyle(vars)}
      role="img"
      aria-label={`Preview of ${site.name}: a website and a Spotlight page at ${site.domain}`}
    >
      <div className="cs-pv-fit" aria-hidden="true">
        <div className="cs-pv-site">
          <div className="cs-pv-bar">
            <i /><i /><i />
            <span className="cs-pv-url">{site.domain}</span>
          </div>
          <div className="cs-pv-nav">
            <span className="cs-pv-brand">{site.name}</span>
            <span className="cs-pv-label">{site.nav1}</span>
            <span className="cs-pv-label">About</span>
            <span className="cs-pv-btn cs-pv-btn-s">{site.cta}</span>
          </div>
          <div className="cs-pv-hero">
            <div className="cs-pv-copy">
              <span className="cs-pv-eyebrow"><span className="cs-pv-rule" />{site.eyebrow}</span>
              <span className="cs-pv-h1">{site.name}<br /><em>{site.em}</em></span>
              <span className="cs-pv-lead">{site.tagline}</span>
              <div className="cs-pv-ctas">
                <span className="cs-pv-btn">{site.ctaLong} →</span>
                <span className="cs-pv-btn cs-pv-btn-o">{site.cta2}</span>
              </div>
            </div>
            <div className="cs-pv-pic">
              <span className="cs-pv-ring" />
              <div className="cs-pv-photo"><Photo src={imagery.hero} pos={imagery.heroPos} sizes={HERO_SIZES} priority={priority} /></div>
            </div>
          </div>
          <div className="cs-pv-offers">
            {site.offers.map((o, i) => (
              <div className="cs-pv-offer" key={i}>
                <div className="cs-pv-offer-pic"><Photo src={o.img} sizes={STRIP_SIZES} /></div>
                <div className="cs-pv-offer-row">
                  <span className="cs-pv-num">{o.n}</span>
                  <span className="cs-pv-offer-text">
                    <span className="cs-pv-offer-t">{o.t}</span>
                    <span className="cs-pv-offer-s">{o.s}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="cs-pv-phone">
          <div className="cs-pv-screen">
            <span className="cs-pv-island" />
            <div className="cs-pv-portrait">
              <span className="cs-pv-ring cs-pv-ring-s" />
              <div className="cs-pv-photo"><Photo src={imagery.portrait} pos={imagery.portraitPos} sizes={PORTRAIT_SIZES} priority={priority} /></div>
            </div>
            <span className="cs-pv-host">Hosted by {site.host}</span>
            <span className="cs-pv-pname">{site.name}<br /><em>{site.em}</em></span>
            <div className="cs-pv-links">
              <span className="cs-pv-link cs-pv-link-p">{site.ctaLong}</span>
              {site.links.map((l, i) => <span className="cs-pv-link" key={i}>{l}</span>)}
            </div>
            <span className="cs-pv-handle">frequency.community/{site.handle}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
