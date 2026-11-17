// THE FEATURES PAGE BODY under the Frequency design: templates/website/Features.html, section by section,
// in the "site" kit's markup plus the page's own styles (.pa-features in site-pages-a.css). Served at
// /features, a route that exists only under Frequency (DAWN 404s it, see the route file).
//
// Every word is the design's. The People half is aqua and the Spaces half is sun whatever side the
// visitor last chose (`.half-p` / `.half-e` set the side colour locally, as the design does). Motion is
// the shell's FX loop; the closing band is the shell's <KeepGoing>.
//
// THE PRODUCT TOUR (owner 2026-11-04, "make each a different layout that speaks to the feature"): the
// hero carries a tour map of every job, each half opens on a full-bleed photo cover with its heading on
// glass, and each job is a sticky side heading beside a bento of feature panels (the first one leads,
// an open one spans the row). Signal lines divide the jobs; dotted connectors join a feature's steps.
// Layout styles: .pa-tour in site-pages-showcase.css.

import '@/app/themes/active/site-pages-a'
import '@/app/themes/active/site-pages-b'
import '@/app/themes/active/site-pages-showcase'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { FEATURE_FALLBACK, ROUTES } from '@/lib/frequency/site-nav'
import { SITE } from '../shared/links'
import { aura, photo, photoBg, photoImg } from '../shared/parts'
import { featureCount, PEOPLE, SPACES, type Half } from './features-data'
import { FeaturesMotion } from './features-motion'

// HOLD THE LINKED JOB'S PHOTO FROM THE TOP OF THE PAGE (SCAN-1265). The /the-quest redirect lands on #f-zaps and
// scrolls straight to that job, so its photo is the slow-phone LCP. A request started where the photo is parsed
// still waits behind the hero and the first jobs on a 1.6 Mbps link, so this script runs before the hero and
// preloads the photo with the SAME srcset and sizes the <img> will carry; the browser then reuses that response
// instead of fetching twice. Only the hashes that name a feature do anything; every other visit pays about 1 KB of inline script.
// JSON for an inline <script>: escapes the characters that could close the tag or break the line,
// so a value can never become code even if one of these strings later comes from an editor.
const scriptJson = (v: unknown) =>
  JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)

const JOB_PHOTO_SIZES = '(max-width: 900px) 100vw, 33vw'
function linkedPhotoPreloadScript(): string {
  // One srcset template plus each photo's encoded path, so the script stays near 1 KB instead of nine full
  // srcsets (~1 KB each). The template is checked against every real srcset on the server; if the image
  // loader ever stops being a plain url= substitution, the photo's whole srcset ships instead.
  const paths: string[] = []
  const byFeature: Record<string, number> = {}
  let template = ''
  for (const job of [...PEOPLE.jobs, ...SPACES.jobs]) {
    const set = photoImg(photo(job.photo), JOB_PHOTO_SIZES).srcSet ?? ''
    const enc = /url=([^&]+)&/.exec(set)?.[1] ?? ''
    if (!template && enc) template = set.split(enc).join('@')
    const entry = enc && template.split('@').join(enc) === set ? enc : set
    let i = paths.indexOf(entry)
    if (i < 0) i = paths.push(entry) - 1
    for (const f of job.features) byFeature[f.id] = i
  }
  return `(function(){try{var T=${scriptJson(template)},P=${scriptJson(paths)},F=${scriptJson(byFeature)},i=F[location.hash.slice(1)];if(i===undefined)return;var e=P[i],s=e.indexOf(' ')<0?T.split('@').join(e):e,l=document.createElement('link');l.rel='preload';l.as='image';l.setAttribute('imagesrcset',s);l.setAttribute('imagesizes',${scriptJson(JOB_PHOTO_SIZES)});l.setAttribute('fetchpriority','high');document.head.appendChild(l)}catch(e){}})()`
}

/**
 * THE HYBRID: each feature's onward page beyond this one (its help article, the live calendar, the
 * Circle guide), from the nav's FEATURE_FALLBACK table. The design stops at "What you can do"; the site
 * already has a real page for most features, so the open card links on to it. Features whose only page
 * is the Spaces marketing page get no link (it would send an owner back where they came from).
 */
function guideFor(id: string): { href: string; label: string } | null {
  const href = FEATURE_FALLBACK[id.replace(/^f-/, '')]
  if (!href || href === ROUTES.spaces) return null
  if (href.startsWith('/help/')) return { href, label: 'Read the guide' }
  if (href.startsWith('/discover/')) return { href, label: 'See what’s happening' }
  return { href, label: 'Read more' }
}

function GuideLink({ id }: { id: string }) {
  const g = guideFor(id)
  if (!g) return null
  return (
    <Link className="more" href={g.href}>
      {g.label} →
    </Link>
  )
}

const jumpColour = (v: string) => ({ '--fq-c': `var(${v})` }) as CSSProperties
const pad = (n: number) => String(n + 1).padStart(2, '0')
/** A job's anchor, for the hero's tour map: #people-find, #spaces-get-paid. */
const jobId = (half: Half, title: string) => `${half.id}-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`

/** Each half's cover photo and what it shows. */
const COVER: Record<Half['id'], { src: string; alt: string }> = {
  people: { src: photo('gathering-11.jpg'), alt: 'Friends dancing together at an outdoor gathering' },
  spaces: { src: photo('gathering-14.jpg'), alt: 'A sound bath set up on the beach with guests on blankets' },
}

function TourMap() {
  return (
    <nav className="tour-map fq-panel" aria-label="Feature tour">
      {[PEOPLE, SPACES].map((half) => (
        <div className={`tm-half half-${half.id === 'people' ? 'p' : 'e'}`} key={half.id}>
          <a className="tm-k" href={`#${half.id}`}>
            <b>{half.label}</b>
            <i>{featureCount(half)}</i>
          </a>
          <ol>
            {half.jobs.map((job, i) => (
              <li key={job.title}>
                <a href={`#${jobId(half, job.title)}`}>
                  <span className="tm-n">{pad(i)}</span>
                  <span className="tm-t">
                    <b>{job.title}</b>
                    <small>{job.line}</small>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </nav>
  )
}

function HalfSection({ half, label }: { half: Half; label: string }) {
  const cover = COVER[half.id]
  return (
    <section className={`half half-${half.id === 'people' ? 'p' : 'e'}`} id={half.id} data-screen-label={label}>
      <div className="tour-cover">
        {/* eslint-disable-next-line @next/next/no-img-element -- the cover sizes its own img (object-fit cover) */}
        <img loading="lazy" decoding="async" {...photoImg(cover.src, '100vw')} alt={cover.alt} />
        <div className="tour-scrim" />
        <div className="fq-grain" />
        <div className="wrap">
          <div className="sh fq-panel">
            <div className="label">
              <b>{half.label}</b>
              {half.sub}
            </div>
            <h2 className="h-l">{half.heading}</h2>
          </div>
        </div>
      </div>
      <div className="wrap">
        {half.jobs.map((job, i) => (
          <div className="job" id={jobId(half, job.title)} key={job.title}>
            <span className="sig" aria-hidden="true" />
            <div className="jl">
              <span className="jn">{pad(i)}</span>
              <h3>{job.title}</h3>
              <p>{job.line}</p>
              <div className="jph fq-iri-rim" data-px=".08">
                {/* suppressHydrationWarning: the pre-paint script below may switch this photo to eager first. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- sized by .jph img */}
                <img loading="lazy" decoding="async" {...photoImg(photo(job.photo), JOB_PHOTO_SIZES)} alt={job.photoAlt} suppressHydrationWarning />
                {/* FETCH THE LINKED JOB'S PHOTO AS THE PARSER REACHES IT (SCAN-1265). A `#f-…` link (the /the-quest
                    redirect lands on #f-zaps) scrolls straight to this job, so its photo is the slow-phone LCP, and
                    `loading="lazy"` held the request until layout. This runs the moment the photo is parsed, well
                    before the end of this long page, and only when the hash names one of this job's features. */}
                <script
                  dangerouslySetInnerHTML={{
                    __html: `(function(){try{if(${scriptJson(job.features.map((f) => f.id))}.indexOf(location.hash.slice(1))<0)return;var i=document.currentScript.previousElementSibling;i.loading='eager';i.fetchPriority='high'}catch(e){}})()`,
                  }}
                />
                <span className="fq-grain" />
              </div>
            </div>
            <div className="jr">
              {job.features.map((f, n) => (
                // suppressHydrationWarning: the pre-paint script below may set `open` before React hydrates.
                <details className={n === 0 ? 'ft lead' : 'ft'} id={f.id} key={f.id} suppressHydrationWarning>
                  <summary>
                    <span className="ic">
                      <FqIcon name={f.icon} />
                    </span>
                    <span className="ftn">
                      <b>{f.name}</b>
                      <span>{f.line}</span>
                    </span>
                    {f.tier && <i className={f.tier === 'Business' ? 'tier biz' : 'tier'}>{f.tier}</i>}
                    <span className="plus" aria-hidden="true" />
                  </summary>
                  <div className="fth">
                    <ol>
                      {f.steps.map((s, k) => (
                        <li key={s}>
                          <span>{pad(k)}</span>
                          {s}
                        </li>
                      ))}
                    </ol>
                    <p className="out">
                      <b>What you can do</b>
                      {f.changes}
                    </p>
                    <GuideLink id={f.id} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function FrequencyFeatures() {
  return (
    <div className="pa-page pa-features pa-tour" data-motion-scope style={{ display: 'contents' }}>
      <FeaturesMotion />
      <script dangerouslySetInnerHTML={{ __html: linkedPhotoPreloadScript() }} />

      <section className="phero" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={photoBg(photo('gathering-10.jpg'))} />
        <div className="fq-aura" style={aura(0.3)} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap tour-hero">
          <div>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span>Features</span>
            </nav>
            <h1 className="h-xl">
              Want to gather? <em className="fq-iri-text">Start with the next date.</em>
            </h1>
            <p>Find a community gathering or host one yourself. Open a feature to see the steps, from choosing a Circle to welcoming guests.</p>
          </div>
          <TourMap />
        </div>
      </section>

      <div className="jump">
        <nav aria-label="Jump to">
          <a href="#people" style={jumpColour('--fq-x-aqua-neon')} data-j="people">
            For people <i>{featureCount(PEOPLE)}</i>
          </a>
          <a href="#spaces" style={jumpColour('--fq-x-sun-neon')} data-j="spaces">
            For spaces <i>{featureCount(SPACES)}</i>
          </a>
        </nav>
      </div>

      <HalfSection half={PEOPLE} label="02 For people" />
      <HalfSection half={SPACES} label="03 For spaces" />
      {
        // OPEN THE LINKED FEATURE BEFORE THE FIRST PAINT (SCAN-1265). A `#f-…` link (the /the-quest redirect
        // lands on #f-zaps) used to open its panel only after hydration, so on a slow phone the open panel
        // pushed the cards below it 400 px down while the visitor read them: CLS 0.301. This runs as the
        // parser reaches it, while every feature is already in the DOM. FeaturesMotion still handles a
        // hash change after load and the scroll offset.
        // The linked job's photo is switched to eager by a script beside that photo (see HalfSection), not here:
        // this script sits after both halves, too late on a slow link to start the request in time.
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var h=location.hash;if(h.indexOf('#f-')!==0)return;var d=document.getElementById(h.slice(1));if(d&&d.tagName==='DETAILS')d.open=true}catch(e){}})()",
          }}
        />
      }

      <section className="sec">
        <div className="wrap">
          <p className="pb-note">
            Ready to pick a plan? <Link href={ROUTES.pricing}>See plans and pricing</Link>.
          </p>
        </div>
      </section>

      <KeepGoing
        title="Ready when you are."
        body="Free for people. Free for Spaces until you charge."
        primary={{ href: SITE.people, label: 'Find your Circle →' }}
        secondary={{ href: SITE.spaces, label: 'Open your Space' }}
      />
    </div>
  )
}
