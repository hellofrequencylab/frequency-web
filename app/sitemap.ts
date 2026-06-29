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
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllArticles, getAllCategories } from "@/lib/help/content";
import { getCityCategoryHubs } from "@/app/discover/events/_data";
import { listDiscoverCities } from "@/app/discover/places/_data";

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
    { url: `${SITE_URL}/beta`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
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
    // Browse-by-place hub — the local-intent landing index (per-city pages are dynamic, below).
    { url: `${SITE_URL}/discover/places`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    // The entity Spaces directory (the networked profile network) + the indexable pricing page.
    { url: `${SITE_URL}/spaces`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
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
    // The four Pillar landing pages (fixed taxonomy — Mind · Body · Spirit · Expression).
    ...(["mind", "body", "spirit", "expression"] as const).map((slug) => ({
      url: `${SITE_URL}/discover/practices/pillar/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
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
    organizerRoutes = organizers;
    spotlightRoutes = spotlights;

    const spaceRoutes: MetadataRoute.Sitemap = spaces.map((s) => ({
      url: `${SITE_URL}/spaces/${s.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      images: [`${SITE_URL}/spaces/${s.slug}/opengraph-image`],
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
      url: `${SITE_URL}/discover/events/${h.citySlug}/${h.category.slug}`,
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
      ...placeRoutes,
    ];
  } catch {
    // Fall back to static routes only.
  }

  return [...staticRoutes, ...helpRoutes, ...dynamicRoutes, ...organizerRoutes, ...spotlightRoutes];
}
