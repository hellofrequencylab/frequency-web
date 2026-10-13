// THE FEATURES PAGE BODY under the Frequency design: templates/website/Features.html, section by section,
// in the "site" kit's markup plus the page's own styles (.pa-features in site-pages-a.css). Served at
// /features, a route that exists only under Frequency (DAWN 404s it, see the route file).
//
// Every word is the design's. The People half is aqua and the Spaces half is sun whatever side the
// visitor last chose (`.half-p` / `.half-e` set the side colour locally, as the design does). Motion is
// the shell's FX loop; the closing band is the shell's <KeepGoing>.

import '@/app/themes/frequency/site-pages-a.css'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { FEATURE_FALLBACK, ROUTES } from '@/lib/frequency/site-nav'
import { SITE } from '../shared/links'
import { aura, photo } from '../shared/parts'
import { featureCount, PEOPLE, SPACES, type Half } from './features-data'
import { FeaturesMotion } from './features-motion'

/**
 * THE HYBRID: each feature's onward page beyond this one (its help article, the live calendar, the
 * Circle guide), from the nav's FEATURE_FALLBACK table. The design stops at "What changes"; the site
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

function HalfSection({ half, label }: { half: Half; label: string }) {
  return (
    <section className={`half half-${half.id === 'people' ? 'p' : 'e'}`} id={half.id} data-screen-label={label}>
      <div className="wrap">
        <div className="sh">
          <div className="label">
            <b>{half.label}</b>
            {half.sub}
          </div>
          <h2 className="h-l">{half.heading}</h2>
        </div>
        {half.jobs.map((job, i) => (
          <div className="job" key={job.title}>
            <div className="jl">
              <span className="jn">{String(i + 1).padStart(2, '0')}</span>
              <h3>{job.title}</h3>
              <p>{job.line}</p>
              <div className="jph" data-px=".08">
                {/* eslint-disable-next-line @next/next/no-img-element -- decorative, sized by .jph img */}
                <img loading="lazy" decoding="async" src={photo(job.photo)} alt="" />
              </div>
            </div>
            <div className="jr">
              {job.features.map((f) => (
                <details className="ft" id={f.id} key={f.id}>
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
                      {f.steps.map((s, n) => (
                        <li key={s}>
                          <span>{String(n + 1).padStart(2, '0')}</span>
                          {s}
                        </li>
                      ))}
                    </ol>
                    <p className="out">
                      <b>What changes</b>
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
    <div className="pa-page pa-features" data-motion-scope style={{ display: 'contents' }}>
      <FeaturesMotion />

      <section className="phero" data-energy="charge" data-screen-label="01 Hero">
        <div className="bg" style={{ backgroundImage: "url('/brand/frequency/broll/yoga-rave-uv-swirl-web.jpg')" }} />
        <div className="fq-aura" style={aura(0.3)} />
        <div className="shade" />
        <div className="fq-grain" />
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Features</span>
          </nav>
          <h1 className="h-xl">
            Everything it takes to <em className="fq-iri-text">gather.</em>
          </h1>
          <p>Every feature, for both sides of the door. Open one to see how it works.</p>
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

      <KeepGoing
        title="Ready when you are."
        body="Free for people. Free for Spaces until you charge."
        primary={{ href: SITE.people, label: 'Find your Circle →' }}
        secondary={{ href: SITE.spaces, label: 'Open your Space' }}
      />
    </div>
  )
}
