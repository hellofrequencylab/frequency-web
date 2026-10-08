import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { resolveHostedSpace } from '@/lib/sites/hosted'
import { appOrigin, normalizeHost } from '@/lib/sites/host'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { readWebsitePublished } from '@/lib/spaces/website'
import { mensworkAccentVars, mensworkSeason, mensworkSign } from '@/lib/theme/menswork'
import { SITE_ADMIN_COOKIE, siteAdminHandoffPath, siteAdminView } from '@/lib/sites/site-admin-pass'
import { readSiteAdminAuthor, readSiteAdminYear, siteAdminAllowed } from '@/lib/sites/site-admin'
import { buildProgramYear, programHolidays, readProgramOverview, type ProgramEvent } from '@/lib/spaces/leadership'
import { readOverviewDoc } from '@/lib/spaces/leadership-overview'
import { loadSpacePageDoc } from '@/lib/spaces/page-doc'
import { SiteOverview } from '@/components/sites/admin/site-overview'
import { SiteCalendar, retreatShort } from '@/components/sites/admin/site-calendar'
import { SiteChrome } from '@/components/sites/site-chrome'
import { siteAdminNavLinks } from '@/components/sites/site-admin-bar'
import { mensworkSiteMenu, siteChromeBasics, siteConsoleHref } from '@/components/sites/site-page'
import { mensworkNowLine } from '@/components/sites/menswork-page'
import { loadMensworkLive } from '@/lib/sites/menswork-data'
import { AccentScope } from '@/components/spaces/accent-scope'
import type { ReactNode } from 'react'

// THE WEBSITE'S ADMIN PAGES (LIVE-864, owner ruling 2026-10-07: "Those are Admin display pages on the
// site. Make them look exactly like the design system."). `/admin/overview` and `/admin/calendar` on a
// Menswork website's own host, rewritten here by the proxy (lib/sites/host.ts).
//
// Never cached: the page reads its pass cookie, so it renders per request and nothing private is stored
// for anyone else. No pass, or one that no longer opens this site (lib/sites/site-admin.ts), sends the
// person to the Frequency console's handoff, which signs them in if needed, checks they run the Space and
// sends them straight back here. A site that is not published or not on the Menswork theme has no admin
// pages (404).
//
// THE SITE'S OWN HEADER (owner ask 2026-10-08: "keep the same header / menu through the site... a double
// menu with admin settings in blue"). Both pages sit inside the website's chrome (site-chrome.tsx): its
// header and menu, the season bar and the footer, with the blue admin row under the header.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** "Oct 29 – 31, 2027", the rail card's line. */
const retreatDates = (e: ProgramEvent) => `${retreatShort(e).replace('–', ' – ')}, ${e.dayKey.slice(0, 4)}`

export default async function SiteAdminPage({ params }: { params: Promise<{ host: string; view: string }> }) {
  const { host: hostParam, view: viewParam } = await params
  const view = siteAdminView(viewParam)
  const host = normalizeHost(decodeURIComponent(hostParam))
  const space = view ? await resolveHostedSpace(host) : null
  if (!view || !space || !readWebsitePublished(space.preferences) || parseSpaceTheme(space.preferences) !== 'menswork') notFound()

  const token = (await cookies()).get(SITE_ADMIN_COOKIE)?.value
  if (!(await siteAdminAllowed(token, host, space))) redirect(`${appOrigin()}${siteAdminHandoffPath(space.slug, view)}`)

  const brandName = space.brandName?.trim() || space.name
  const now = new Date()
  const { year, events, notes } = await readSiteAdminYear(space.id, now)
  const months = buildProgramYear(year, events, now)
  const retreatEvent = events.find((e) => e.endDayKey && /\bretreat\b/i.test(e.title)) ?? events.find((e) => e.endDayKey)
  const retreatMonth = retreatEvent ? months.find((m) => retreatEvent.dayKey.startsWith(`${m.year}-${String(m.month0 + 1).padStart(2, '0')}`)) : null

  // The website's own header and menu, the same on every page of the site (its base is `` on its own host).
  const chrome = await siteChromeBasics(space, '')
  const live = await loadMensworkLive(space.id, { events: true, circles: false, journeys: false })
  const nowLine = mensworkNowLine((space.preferences as Record<string, unknown> | null)?.pageDocs, now)
  const season = mensworkSeason(now)
  const inChrome = (body: ReactNode) => (
    <AccentScope vars={mensworkAccentVars(space.brandAccent)} theme="menswork">
      <SiteChrome
        brandName={brandName}
        homeHref={chrome.homeHref}
        links={chrome.pageLinks.length > 0 ? mensworkSiteMenu(chrome.homeHref, chrome.pages, chrome.pageLinks) : []}
        cta={chrome.cta}
        // The Menswork theme is a chosen page theme, so its faces lead.
        themeFonts
        skin={{ theme: 'menswork', season }}
        logoUrl={space.brandLogoUrl}
        tagline={chrome.tagline}
        seasonNow={{ ...nowLine, next: live.events.find((e) => /circle night/i.test(e.title))?.startsAt ?? null }}
        adminHref="/admin"
        adminNav={{ links: siteAdminNavLinks(siteConsoleHref(chrome.origin, space.slug), view), gated: false }}
      >
        {body}
      </SiteChrome>
    </AccentScope>
  )

  if (view === 'overview') {
    const doc = readOverviewDoc(readProgramOverview(space.preferences))
    return inChrome(
      <SiteOverview
        brandName={brandName}
        doc={doc}
        photo={space.coverImageUrl ?? null}
        author={await readSiteAdminAuthor(space.ownerProfileId)}
        retreat={
          retreatEvent && retreatMonth
            ? {
                title: retreatEvent.title,
                dates: retreatDates(retreatEvent),
                href: `/admin/calendar#${retreatMonth.id}`,
              }
            : null
        }
      />,
    )
  }

  const retreatPhoto = retreatEvent ? await pagePhoto(space.preferences, brandName, 'retreat') : null
  return inChrome(
    <SiteCalendar
      brandName={brandName}
      year={year}
      months={months}
      currentSeason={season}
      currentSign={mensworkSign(now)}
      holidays={programHolidays(year)}
      notes={notes}
      retreat={
        retreatEvent && retreatMonth
          ? {
              title: retreatEvent.title,
              dates: retreatDates(retreatEvent),
              monthId: retreatMonth.id,
              photo: retreatPhoto,
            }
          : null
      }
    />,
  )
}

/** The first photo on the website page whose slug names `word` (the Desert Retreat page's hero), else null. */
async function pagePhoto(preferences: unknown, brandName: string, word: string): Promise<string | null> {
  const pages = (preferences as { pages?: { slug?: unknown }[] } | null)?.pages ?? []
  const slug = pages.map((p) => (typeof p?.slug === 'string' ? p.slug : '')).find((s) => s.includes(word))
  if (!slug) return null
  const doc = await loadSpacePageDoc(preferences, brandName, slug)
  for (const block of doc.content ?? []) {
    const image = (block?.props as Record<string, unknown> | undefined)?.image
    if (typeof image === 'string' && /^https:\/\//.test(image)) return image.split('?')[0]
  }
  return null
}
