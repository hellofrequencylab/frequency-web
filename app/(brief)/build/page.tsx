import type { Metadata, Viewport } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { LINK_ONLY_ROBOTS } from '@/lib/seo/link-only'
import { PrivatePageTracker } from '@/components/frequency/site/shell/private-page-tracker'
import { BUILD_PAGES } from './build-pages'
import './vision/vision.css'
import './build-index.css'

// /build: the index of the link-only partner pages (owner 2026-11-18). Daniel opens it in a meeting and
// picks the page to show. LINK-ONLY like every page it lists: noindex, out of the nav and app/sitemap.ts,
// and NOT in app/robots.ts DISALLOW (a blocked page's noindex is never read). Not secret: anyone with
// the link can open it. See docs/HOW-BRIEF.md.
const TITLE = 'Partner pages'
const DESCRIPTION = 'The pitch and planning pages Frequency shares with partners.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: LINK_ONLY_ROBOTS,
  openGraph: { title: 'Frequency partner pages', description: DESCRIPTION, url: '/build', type: 'website', siteName: 'Frequency', images: ['/brand/frequency/facilities/biophilic-lounge-day.jpg'] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  referrer: 'strict-origin-when-cross-origin',
}

export const viewport: Viewport = { themeColor: '#0A0612', colorScheme: 'dark' } // token-ok: browser chrome colour is a meta tag value, it cannot read a CSS variable

export const dynamic = 'force-static'

export default function BuildIndexPage() {
  return (
    <>
      <main className="vx-root bx-root" data-theme="stage" data-energy="flow">
        <header className="bx-head">
          <span className="fq-logo bx-logo" role="img" aria-label="Frequency" />
          <h1 className="bx-title">Partner pages</h1>
          <p className="bx-lede">
            The pages we walk partners through. Each opens on its own link and none of them is in search. Add <code>?r=their-name</code> to
            a link before you send it and you can see who read it, and how far, on the Growth dashboard.
          </p>
        </header>
        <section id="pages" className="bx-grid" aria-label="Pages">
          {BUILD_PAGES.map((p, i) => (
            <Link key={p.href} href={p.href} className="bx-card">
              <span className="bx-photo">
                <Image src={p.image} alt={p.imageAlt} fill sizes="(min-width: 1100px) 560px, (min-width: 720px) 50vw, 100vw" preload={i < 2} />
              </span>
              <span className="bx-body">
                <span className="bx-kicker">{p.kicker}</span>
                <span className="bx-card-title">{p.title}</span>
                <span className="bx-summary">{p.summary}</span>
                <span className="bx-path">frequencylocal.com{p.href}<span aria-hidden="true"> →</span></span>
              </span>
            </Link>
          ))}
        </section>
      </main>
      <PrivatePageTracker page="/build" />
    </>
  )
}
