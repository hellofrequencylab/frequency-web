import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import {
  getTopicalChannels,
  getPublicCircles,
  getPublicEvents,
} from "@/lib/discover";
import { listPublicJourneys } from "@/lib/journey-plans";
import { listActivePartners } from "@/lib/partners/read";
import { listPublicPractices } from "@/lib/practices";
import { listNetworkedSpaces } from "@/lib/spaces/discovery";
import { DIRECTORY_TYPES } from "@/components/spaces/space-type";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllArticles, getAllCategories } from "@/lib/help/content";
import { getCityCategoryHubs } from "@/app/discover/events/_data";
import { listDiscoverCities } from "@/app/discover/places/_data";
import { listDensityCities } from "@/app/discover/cities/_data";
import { COMPARISONS, comparisonPath } from "@/lib/marketing/comparisons";
import { funnelSlugs } from "@/lib/marketing/funnel-config";

// Organizer profiles (/discover/events/organizer/[handle]) — one URL per host with
// at least one upcoming public/unlisted event. Reads the redaction-safe RPC, which
// never enumerates hosts of circle_only/private events (Events B-4).
// Published Spotlight profiles (/spotlight/[handle]) — public when published. The
// published flag lives in profiles.meta (RLS-protected), so this reads server-side with
// the admin client; only the handle crosses out (never meta/contact/geo).
async function getSpotlightRoutes(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("handle")
      .eq("is_active", true)
      .eq("is_system", false)
      .filter("meta->spotlight->>published", "eq", "true")
      .limit(1000);
    if (!Array.isArray(data)) return [];
    return (data as { handle: string | null }[])
      .filter((p) => p.handle)
      .map((p) => ({
        url: `${SITE_URL}/spotlight/${p.handle}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      }));
  } catch {
    return [];
  }
}

async function getOrganizerRoutes(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase.rpc("public_organizer_handles", { _limit: 500 });
    if (!Array.isArray(data)) return [];
    return (data as { handle: string; next_starts: string | null }[]).map((h) => ({
      url: `${SITE_URL}/discover/events/organizer/${h.handle}`,
      lastModified: h.next_starts ? new Date(h.next_starts) : now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

// Dynamic sitemap. Static marketing routes plus every public, redaction-safe
// /discover URL (topics, circles, events) pulled through the same column-safe
// RPCs the pages use. Authed app surfaces are excluded — they're robots-
// disallowed and only redirect to /sign-in.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    // The /start role picker (the funnel hub). Build / Practice / Spread were FOLDED
    // into The Community + The Quest (their routes 308-redirect), so a redirected URL
    // is no longer advertised here as canonical.
    { url: `${SITE_URL}/start`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/the-lab`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/the-community`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/the-quest`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // The core story page — the answer-first "What is Frequency?" explainer of the
    // movement/vision (Article + FAQ schema). Complements /about (the founding narrative).
    { url: `${SITE_URL}/what-is-frequency`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/beta`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/founders`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/founders/offer`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/founders/business`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/discover`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/discover/circles`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/discover/events`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    // The community events index — the canonical public events listing (the /discover/events page
    // is a curated browse that links here).
    { url: `${SITE_URL}/events`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/discover/journeys`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/discover/topics`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/discover/partners`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/discover/practices`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    // Public Business Spaces directory — the indexable, no-rail twin of the in-app /spaces/directory (the
    // per-type hubs /discover/spaces/[type] are dynamic, below).
    { url: `${SITE_URL}/discover/spaces`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    // Browse-by-place hub — the local-intent landing index (per-city pages are dynamic, below).
    { url: `${SITE_URL}/discover/places`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    // Density-gated city landing hub (GE11-2) — only cities above the density
    // threshold get a per-city landing page (those are dynamic, below); this index
    // lists them.
    { url: `${SITE_URL}/discover/cities`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    // Comparison ("alternative to X") hub + one page per named alternative
    // (GE11-1). The set is a static registry, so the per-page URLs are safe to
    // advertise here directly.
    { url: `${SITE_URL}/vs`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...COMPARISONS.map((c) => ({
      url: `${SITE_URL}${comparisonPath(c.slug)}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    // The entity Spaces directory (the networked profile network) + the indexable pricing page.
    { url: `${SITE_URL}/spaces`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    // Operator funnel doors, /for/<niche> (ADR-591). A static registry (lib/marketing/funnel-config), so
    // the per-page URLs are safe to advertise here directly.
    ...funnelSlugs().map((slug) => ({
      url: `${SITE_URL}/for/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // SEO/AIO pillar pages (problem-aware entries: loneliness, adult friendship,
    // building community, life after the feed, always-wired stress, new-city
    // connection). Answer-first; Article + FAQ schema. These complete the five
    // Seeker pain clusters (CONTENT-VOICE §7a) with a pillar each.
    { url: `${SITE_URL}/loneliness`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/friendship-as-an-adult`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/how-to-build-community`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/life-after-the-feed`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/calm-down-fast`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/meet-people-new-city`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/feel-less-awkward-in-groups`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Leader-track pillar (CONTENT-VOICE §7b.2): the activation guide for the
    // natural connector — answer-first, HowTo + FAQ schema.
    { url: `${SITE_URL}/how-to-start-a-circle`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Seeker-track pillar (CONTENT-VOICE §7a): finding your people by shared
    // wavelength — answer-first, Article + FAQ schema.
    { url: `${SITE_URL}/find-like-minded-people`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Seeker-track pillar (CONTENT-VOICE §7a): closing the gap between wanting
    // connection and the daily default of staying in — answer-first, Article + FAQ schema.
    { url: `${SITE_URL}/how-to-be-more-social`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Seeker-track pillar (CONTENT-VOICE §7a): a social life without drinking —
    // gather around an activity, not a bar. Answer-first, Article + FAQ schema.
    { url: `${SITE_URL}/social-life-without-drinking`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Seeker-track pillar (CONTENT-VOICE §7a): reaching back to a friend you
    // drifted from — one warm message, one easy plan. Answer-first, HowTo + FAQ schema.
    { url: `${SITE_URL}/how-to-reconnect-with-old-friends`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // Labs-track SEO pillar cluster (CONTENT-VOICE §2b builder/operator track): the
    // community-builder pages that balance the Seeker pillars above (Labs = the
    // infrastructure that lets people build + run third spaces). Each funnels to
    // /spaces (+ The Lab). Answer-first; Article/HowTo + FAQ schema.
    { url: `${SITE_URL}/what-is-a-third-space`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/how-to-run-a-community-space`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/tools-for-community-builders`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/host-a-recurring-gathering`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    // The four Pillar landing pages (fixed taxonomy — Mind · Body · Spirit · Expression).
    ...(["mind", "body", "spirit", "expression"] as const).map((slug) => ({
      url: `${SITE_URL}/discover/practices/pillar/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    // /sign-in is intentionally omitted: the page is robots noindex,nofollow, so
    // advertising it here would trigger "Submitted URL marked noindex" in Search Console.
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    // Public double-opt-in subscribe landing (the confirm page is noindex + allowlisted in check-seo).
    { url: `${SITE_URL}/subscribe`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/help/changelog`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
  ];

  // Help center entries — filesystem-based, safe at build time.
  let helpRoutes: MetadataRoute.Sitemap = [];
  try {
    const [articles, categories] = await Promise.all([
      getAllArticles(),
      getAllCategories(),
    ]);

    const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
      url: `${SITE_URL}/help/${a.category}/${a.slug}`,
      lastModified: a.updated ? new Date(a.updated) : now,
      changeFrequency: "weekly",
      priority: 0.5,
    }));

    const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${SITE_URL}/help/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.4,
    }));

    helpRoutes = [...categoryRoutes, ...articleRoutes];
  } catch {
    // Fall back gracefully; help content missing shouldn't break the sitemap.
  }

  // Best-effort dynamic entries — never let a data hiccup break the sitemap.
  let dynamicRoutes: MetadataRoute.Sitemap = [];
  let organizerRoutes: MetadataRoute.Sitemap = [];
  let spotlightRoutes: MetadataRoute.Sitemap = [];
  let hubRoutes: MetadataRoute.Sitemap = [];
  try {
    const [channels, circles, events, journeys, organizers, spotlights, hubs, partners, practices, spaces, cities] = await Promise.all([
      getTopicalChannels(),
      getPublicCircles(200),
      getPublicEvents(200),
      listPublicJourneys(),
      getOrganizerRoutes(now),
      getSpotlightRoutes(now),
      // City × category hubs — only pairs that actually have upcoming public
      // events (empty/low-value facets never get a URL, so they stay out of crawl).
      getCityCategoryHubs().catch(() => []),
      listActivePartners({ limit: 500 }).catch(() => []),
      listPublicPractices("top").catch(() => []),
      // Networked entity Spaces, via the same redaction-safe reader the directory uses. It returns
      // ONLY visibility='network', status='active' Spaces and excludes the root, so PRIVATE Spaces
      // are isolated OUT of the sitemap by construction (fail-safe to [] on any error).
      listNetworkedSpaces().catch(() => []),
      // Browse-by-place city hubs — only cities with ≥1 public circle or upcoming event
      // (empty places never get a URL, so low-value facets stay out of crawl).
      listDiscoverCities().catch(() => []),
    ]);

    // Density-gated city landing pages (GE11-2) — ONLY cities above the density
    // threshold (lib/analytics/density) get a per-city landing URL, so thin/empty
    // city pages never enter the crawl. Fail-safe to [] on any error.
    const densityCities = await listDensityCities().catch(() => []);
    const densityCityRoutes: MetadataRoute.Sitemap = densityCities.map((c) => ({
      url: `${SITE_URL}/discover/cities/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));
    organizerRoutes = organizers;
    spotlightRoutes = spotlights;

    const spaceRoutes: MetadataRoute.Sitemap = spaces.map((s) => ({
      url: `${SITE_URL}/spaces/${s.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      images: [`${SITE_URL}/spaces/${s.slug}/opengraph-image`],
    }));

    // Programmatic type hubs (/discover/spaces/[type]) — include ONLY types with enough networked
    // Spaces to clear the page's own index threshold, so we never advertise a noindex hub (matches
    // HUB_MIN_INDEX in app/discover/spaces/[type]/page.tsx).
    const spaceHubCounts = new Map<string, number>();
    for (const s of spaces) spaceHubCounts.set(s.type, (spaceHubCounts.get(s.type) ?? 0) + 1);
    const spaceHubRoutes: MetadataRoute.Sitemap = DIRECTORY_TYPES.filter(
      (t) => (spaceHubCounts.get(t.value) ?? 0) >= 3,
    ).map((t) => ({
      url: `${SITE_URL}/discover/spaces/${t.value}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const partnerRoutes: MetadataRoute.Sitemap = partners.map((p) => ({
      url: `${SITE_URL}/discover/partners/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const practiceRoutes: MetadataRoute.Sitemap = practices.map((p) => ({
      url: `${SITE_URL}/discover/practices/${p.slug ?? p.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    const placeRoutes: MetadataRoute.Sitemap = cities.map((c) => ({
      url: `${SITE_URL}/discover/places/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

    hubRoutes = hubs.map((h) => ({
      url: `${SITE_URL}/discover/events/in/${h.citySlug}/${h.category.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

    const topicRoutes: MetadataRoute.Sitemap = channels.map((c) => ({
      url: `${SITE_URL}/discover/topics/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    const circleRoutes: MetadataRoute.Sitemap = circles.map((c) => ({
      url: `${SITE_URL}/discover/circles/${c.id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    // Only UPCOMING events are listed: getPublicEvents (public_events RPC) filters
    // starts_at >= now(), so expired events are isolated OUT of the sitemap by
    // construction (they go noindex,follow on the page until pruned). The CANONICAL event URL
    // is now /events/<slug> (the discover detail canonicalises here), so the sitemap points at
    // it; each entry carries the per-event OG image for the image sitemap.
    const eventRoutes: MetadataRoute.Sitemap = events.map((e) => ({
      url: `${SITE_URL}/events/${e.slug}`,
      lastModified: new Date(e.starts_at),
      changeFrequency: "daily",
      priority: 0.7,
      images: [`${SITE_URL}/events/${e.slug}/opengraph-image`],
    }));

    const journeyRoutes: MetadataRoute.Sitemap = journeys.map((j) => ({
      url: `${SITE_URL}/discover/journeys/${j.slug}`,
      lastModified: j.updated_at ? new Date(j.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    dynamicRoutes = [
      ...topicRoutes,
      ...circleRoutes,
      ...eventRoutes,
      ...hubRoutes,
      ...journeyRoutes,
      ...partnerRoutes,
      ...practiceRoutes,
      ...spaceRoutes,
      ...spaceHubRoutes,
      ...placeRoutes,
      ...densityCityRoutes,
    ];
  } catch {
    // Fall back to static routes only.
  }

  return [...staticRoutes, ...helpRoutes, ...dynamicRoutes, ...organizerRoutes, ...spotlightRoutes];
}
