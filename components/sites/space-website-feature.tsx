import Link from 'next/link'
import { ArrowRight, Globe } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonClasses } from '@/components/ui/button'
import { featureAllowed } from '@/lib/pricing/gates'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { appOrigin, siteSubdomainHost } from '@/lib/sites/host'
import { readSiteHero, readWebsitePublished } from '@/lib/spaces/website'
import { readSiteDomainCandidate } from '@/lib/sites/domain-setup'
import { siteDomainStatus } from '@/lib/sites/vercel-domains'
import { domainPurchaseOpen } from '@/lib/sites/domain-purchase'
import { SiteDomainPanel } from './site-domain-panel'
import { WebsitePublishControls } from './website-publish-controls'
import { WebsiteHeadlineForm } from './website-headline-form'
import { WebsiteCreditForm } from './website-credit-form'
import { badgeRemovalHeld, readFooterBadge } from '@/lib/sites/site-badge'

// THE WEBSITE FEATURE on a Space's Profile & Settings tab (owner ask 2026-10-06: "a prominent feature in
// profile and settings with a little CTA to upgrade"). One card: what the website is, its live state,
// Publish / View / Unpublish, then the domain section. Publishing is open to every Space, at its free
// `<slug>.frequencylocal.com` address (LIVE-782), or its own domain once that domain is serving;
// the own-domain half is the `custom_domain` gate (Business and up, LIVE-310). A plan below that sees a
// small upgrade nudge; during the open-access window it can still connect, and the nudge says where the
// domain lives after it. Server Component: the board renders it only on the settings tab, behind Suspense.

export async function SpaceWebsiteFeature({
  space,
}: {
  space: { slug: string; plan?: string | null; domain: string | null; preferences?: unknown; entitlements?: unknown }
}) {
  const published = readWebsitePublished(space.preferences)
  const siteHero = readSiteHero(space.preferences)
  const domainStatus = await readDomainStatus(space)
  const siteUrl = websiteUrl(space.slug, domainStatus)
  const address = siteUrl.replace(/^https?:\/\//, '')

  return (
    <section aria-labelledby="website-feature-title" className="rounded-card border border-primary bg-surface p-5 lift-1">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-primary-bg text-primary-strong">
          <Globe className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="website-feature-title" className="font-display text-lead font-bold text-text">
              Your website
            </h2>
            {published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Not published</Badge>}
          </div>
          <p className="mt-1 text-body-sm text-muted">
            Your pages as a standalone website with your own brand and no Frequency menus. It shows the same
            blocks as your profile, so you edit once and both stay in sync.
          </p>
          {published && <p className="mt-1 break-all text-body-sm font-semibold text-text">{address}</p>}
          <div className="mt-4">
            <WebsitePublishControls slug={space.slug} published={published} siteUrl={siteUrl} />
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold text-text">Website hero</h3>
        <p className="mt-1 mb-3 text-body-sm text-muted">
          What your website leads with. Your Space page keeps its own header from your Hero settings.
        </p>
        <WebsiteHeadlineForm slug={space.slug} initial={siteHero} />
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-body font-semibold text-text">Footer credit</h3>
        <p className="mt-1 mb-3 text-body-sm text-muted">How the bottom of your website mentions Frequency.</p>
        <WebsiteCreditForm slug={space.slug} initial={readFooterBadge(space.preferences)} removalHeld={badgeRemovalHeld(space.plan, space.entitlements)} />
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <Link href="#domain" className="text-body-sm font-semibold text-primary-strong hover:underline">
          Domain and DNS settings
        </Link>
      </div>
    </section>
  )
}

type SpaceDomainInput = { slug: string; plan?: string | null; domain: string | null; preferences?: unknown }

async function readDomainStatus(space: SpaceDomainInput) {
  const setupDomain = readSiteDomainCandidate(space.preferences) ?? space.domain
  return setupDomain ? { domain: setupDomain, ...(await siteDomainStatus(setupDomain)) } : null
}

/** DOMAIN AND DNS: its own card on Profile & Settings, right under the website card (anchor `#domain`).
 *  Every domain, subdomain and DNS control lives here, in Manage, never on the public site or in the
 *  website editor, which only link to it. Server Component behind Suspense in the board. */
export async function SpaceDomainFeature({ space }: { space: SpaceDomainInput }) {
  const published = readWebsitePublished(space.preferences)
  const plan = asSpacePlan(space.plan)
  // `entitled` is the plan itself (gates live); `canConnect` is what the connect action allows today.
  // `buyOpen`: domain sales are switched on (LIVE-781); off, Buy a new domain reads Coming soon.
  const [entitled, canConnect, buyOpen] = await Promise.all([
    featureAllowed('custom_domain', { plan }, { gatesLive: true }),
    featureGatesLive().then((gatesLive) => featureAllowed('custom_domain', { plan }, { gatesLive })),
    domainPurchaseOpen(),
  ])
  const domainStatus = await readDomainStatus(space)
  const free = siteSubdomainHost(space.slug)
  return (
    <section id="domain" aria-labelledby="domain-feature-title" className="scroll-mt-24 rounded-card border border-border bg-surface p-5 lift-1">
      <h2 id="domain-feature-title" className="font-display text-lead font-bold text-text">
        Domain and DNS
      </h2>
      <p className="mt-1 text-body-sm text-muted">
        Where your website lives. {free ? <>Your free address is <span className="font-semibold text-text">{free}</span>.</> : null} Connect your own
        domain, copy the DNS records, and watch the status here.
      </p>
      <div className="mt-5">
        {canConnect || domainStatus ? (
          <SiteDomainPanel key={`${space.slug}:${JSON.stringify(domainStatus)}`} slug={space.slug} initial={domainStatus} websitePublished={published} buyOpen={buyOpen} />
        ) : null}
        {!entitled && <DomainUpgradeNudge slug={space.slug} openNow={canConnect} />}
      </div>
    </section>
  )
}

/** Where the website is today: the owner's own domain once it is attached, its DNS points at
 *  hosting and it serves https (a domain still being set up would open nothing, or a browser
 *  warning), else the free `<slug>.frequencylocal.com` subdomain, else (a slug that cannot be a
 *  subdomain) /sites/<slug>. */
function websiteUrl(
  slug: string,
  domain: { domain: string; attached: boolean; dnsReady: boolean; secure: boolean } | null,
): string {
  if (domain && domain.attached && domain.dnsReady && domain.secure) return `https://${domain.domain}`
  const subdomain = siteSubdomainHost(slug)
  return subdomain ? `https://${subdomain}` : `${appOrigin()}/sites/${slug}`
}

function DomainUpgradeNudge({ slug, openNow }: { slug: string; openNow: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-primary-bg px-4 py-3">
      <p className="min-w-0 flex-1 text-body-sm text-text">
        <span className="font-semibold">Your own domain comes with Business.</span>{' '}
        {openNow ? 'It is open to every Space for now, and stays yours on Business.' : 'Upgrade to put your website on yourname.com.'}
      </p>
      <Link href={`/spaces/${slug}/settings/billing`} className={buttonClasses('secondary', 'sm')}>
        See plans
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  )
}
