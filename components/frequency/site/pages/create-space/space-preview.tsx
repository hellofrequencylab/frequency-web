// The live preview of a Space: its website in a browser frame and its Spotlight in a phone, in whichever Theme Kit
// the visitor picked. PURE: tokens and site in, markup out (no state, no data). It reads only the --pv-* contract
// of lib/theme/preview-tokens.ts, so a kit that declares the contract is supported with no change here. Sized in
// container units, so it scales to any width. Styles: create-space.css (cs-pv-*).
//
// v3 (docs/design-systems/create-a-space): the nav wears the logo choice (wordmark, monogram or an upload), the
// phone wears the host's photo or their initial, a contact strip appears once step 3 fills it, the copy is a ghost
// at half opacity until the mock-up lands, and it shimmers while the mock-up is being made.
import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { KitImagery, PreviewSite } from '@/lib/create-space/preview-site'
import type { MegaThemeId } from '@/lib/theme/mega-theme'

/** A picture of their own (an object URL from the Photos step) or nothing, meaning the kit's slot. */
type OwnPicture = { src: string } | null

export interface SpacePreviewProps {
  kit: MegaThemeId
  /** The --pv-* tokens of the kit plus the runtime accent trio. */
  vars: Record<string, string>
  site: PreviewSite
  imagery: KitImagery
  /** The cover (the website hero picture): a kit slot's src, or their own. */
  cover?: string
  /** The host portrait on the phone: a kit slot's src, or their own. */
  portrait?: string
  /** The logo in the website nav. */
  logo?: 'word' | 'mono' | { src: string }
  /** The phone's portrait slot: the portrait, their initial, or their own picture. */
  profile?: 'photo' | 'initials' | OwnPicture
  /** The business's initial (the monogram) and the host's (the initials avatar). */
  initial?: string
  hostInitial?: string
  /** Half opacity on the lines the mock-up will fill. */
  ghost?: boolean
  /** The mock-up is being made: the ghost lines shimmer. */
  busy?: boolean
  /** Bumped when the mock-up lands, so the copy pops in again. */
  contentKey?: number
  /** Hero pictures load first when the preview sits above the fold. */
  priority?: boolean
  className?: string
}

const asStyle = (v: Record<string, string>) => v as CSSProperties
const HERO_SIZES = '(min-width: 1280px) 520px, 90vw'
const PORTRAIT_SIZES = '(min-width: 1280px) 240px, 40vw'
const STRIP_SIZES = '(min-width: 1280px) 220px, 40vw'

function Photo({ src, pos, sizes, priority }: { src: string; pos?: string; sizes: string; priority?: boolean }) {
  // Their own pictures are object URLs in the browser; those cannot go through the image optimizer.
  const own = src.startsWith('blob:') || src.startsWith('data:')
  return <Image key={src} src={src} alt="" fill sizes={sizes} priority={priority} unoptimized={own} style={{ objectFit: 'cover', objectPosition: pos ?? 'center' }} />
}

export function SpacePreview(props: SpacePreviewProps) {
  const { kit, vars, site, imagery, priority = false, className, ghost = false, busy = false, contentKey = 0 } = props
  const cover = props.cover ?? imagery.hero
  const coverPos = props.cover && props.cover !== imagery.hero ? 'center' : imagery.heroPos
  const portrait = props.portrait ?? imagery.portrait
  const portraitPos = props.portrait && props.portrait !== imagery.portrait ? 'center' : imagery.portraitPos
  const logo = props.logo ?? 'word'
  const profile = props.profile ?? 'photo'
  const initial = props.initial ?? (site.name[0] ?? 'Y').toUpperCase()
  const hostInitial = props.hostInitial ?? initial
  const reach = [['Visit', site.contact.visit], ['Write', site.contact.write], ['Call', site.contact.call]].filter(([, v]) => v)
  const sm = site.sample
  const profileKit = kit === 'bold' || kit === 'wildheart'
  const headline = sm?.headline ?? ''
  const emText = sm?.em ?? site.em
  const heroCta = sm ? (sm.nav ?? sm.cta) : site.cta
  const heroCtaLong = sm ? sm.cta : site.ctaLong
  const heroCta2 = sm ? sm.cta2 : site.cta2
  const phoneFoot = reach.length ? reach.map(([, v]) => v).join(' · ') : site.domain
  return (
    <div
      className={`cs-pv${className ? ` ${className}` : ''}`}
      data-preview-theme={kit}
      data-ghost={ghost ? '1' : undefined}
      data-long={!sm && site.name.length + site.em.length > 22 ? '1' : undefined}
      data-sample={sm ? '1' : undefined}
      data-busy={busy ? '1' : undefined}
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
            <span className="cs-pv-logo">
              {logo === 'mono' ? <span className="cs-pv-mono">{initial}</span> : null}
              {typeof logo === 'object' ? <span className="cs-pv-logo-img"><Image src={logo.src} alt="" fill sizes="120px" unoptimized /></span> : null}
              {logo === 'word' ? <><span className="cs-pv-badge">{initial}</span><span className="cs-pv-brand">{site.name}</span></> : null}
            </span>
            <span className="cs-pv-label">{site.nav1}</span>
            <span className="cs-pv-label">About</span>
            <span className="cs-pv-btn cs-pv-btn-s">{heroCta}</span>
          </div>
          <div className="cs-pv-hero">
            <div className="cs-pv-copy" key={contentKey} data-reveal={contentKey > 0 ? '1' : undefined}>
              <span className="cs-pv-eyebrow"><span className="cs-pv-rule" />{sm?.eyebrow ?? site.eyebrow}</span>
              <span className="cs-pv-h1">{headline || site.name}<br /><em>{emText}</em></span>
              <span className="cs-pv-lead">{sm?.lead ?? site.tagline}</span>
              <div className="cs-pv-ctas">
                <span className="cs-pv-btn">{heroCtaLong} →</span>
                <span className="cs-pv-btn cs-pv-btn-o">{heroCta2}</span>
              </div>
            </div>
            <div className="cs-pv-pic">
              <span className="cs-pv-ring" />
              <div className="cs-pv-photo"><Photo src={cover} pos={coverPos} sizes={HERO_SIZES} priority={priority} /></div>
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
          {reach.length ? (
            <div className="cs-pv-reach">
              {reach.map(([k, v]) => <span key={k}><b>{k}</b>{v}</span>)}
            </div>
          ) : null}
        </div>

        <div className="cs-pv-phone">
          <div className="cs-pv-screen">
            <span className="cs-pv-island" />
            <div className="cs-pv-portrait">
              <span className="cs-pv-ring cs-pv-ring-s" />
              <div className="cs-pv-photo">
                {profile === 'initials' ? <span className="cs-pv-initials">{hostInitial}</span> : (
                  <Photo src={profile && typeof profile === 'object' ? profile.src : portrait} pos={profile && typeof profile === 'object' ? 'center' : portraitPos} sizes={PORTRAIT_SIZES} priority={priority} />
                )}
              </div>
            </div>
            <span className="cs-pv-avatar">{kit === 'wildheart' && imagery.portraits[1] ? <Photo src={imagery.portraits[1]} sizes="80px" /> : hostInitial}</span>
            <span className="cs-pv-host">Hosted by {site.host}</span>
            {profileKit ? (
              <>
                <span className="cs-pv-pname">{site.name}</span>
                <span className="cs-pv-phandle">@{site.handle}</span>
                <span className="cs-pv-ploc">{site.contact.visit || 'Your city'}</span>
                <span className="cs-pv-pbio">{sm?.lead ?? site.tagline}</span>
              </>
            ) : (
              <span className="cs-pv-pname">{headline || site.name}<br /><em>{emText}</em></span>
            )}
            <div className="cs-pv-links">
              <span className="cs-pv-link cs-pv-link-p">{heroCtaLong}</span>
              {site.links.map((l, i) => <span className="cs-pv-link" key={i}>{l}</span>)}
            </div>
            <span className="cs-pv-handle">{phoneFoot}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
