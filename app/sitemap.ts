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
import { createPublicClient } from "@/lib/supabase/public";
import { getAllArticles, getAllCategories } from "@/lib/help/content";
import { getCityCategoryHubs } from "@/app/discover/events/_data";

// Organizer profiles (/discover/events/organizer/[handle]) — one URL per host with
// at least one upcoming public/unlisted event. Reads the redaction-safe RPC, which
// never enumerates hosts of circle_only/private events (Events B-4).
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
    { url: `${SITE_URL}/the-lab`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/the-community`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/the-quest`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/beta`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/discover`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/discover/circles`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/discover/events`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/discover/journeys`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/discover/topics`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/discover/partners`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/discover/practices`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    // The four Pillar landing pages (fixed taxonomy — Mind · Body · Spirit · Expression).
    ...(["mind", "body", "spirit", "expression"] as const).map((slug) => ({
      url: `${SITE_URL}/discover/practices/pillar/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/sign-in`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
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
  let hubRoutes: MetadataRoute.Sitemap = [];
  try {
    const [channels, circles, events, journeys, organizers, hubs, partners, practices] = await Promise.all([
      getTopicalChannels(),
      getPublicCircles(200),
      getPublicEvents(200),
      listPublicJourneys(),
      getOrganizerRoutes(now),
      // City × category hubs — only pairs that actually have upcoming public
      // events (empty/low-value facets never get a URL, so they stay out of crawl).
      getCityCategoryHubs().catch(() => []),
      listActivePartners({ limit: 500 }).catch(() => []),
      listPublicPractices("top").catch(() => []),
    ]);
    organizerRoutes = organizers;

    const partnerRoutes: MetadataRoute.Sitemap = partners.map((p) => ({
      url: `${SITE_URL}/discover/partners/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    const practiceRoutes: MetadataRoute.Sitemap = practices.map((p) => ({
      url: `${SITE_URL}/discover/practices/${p.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
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
    // construction (they go noindex,follow on the page until pruned). Each entry
    // carries its dynamic per-event OG image for the image sitemap.
    const eventRoutes: MetadataRoute.Sitemap = events.map((e) => ({
      url: `${SITE_URL}/discover/events/${e.slug}`,
      lastModified: new Date(e.starts_at),
      changeFrequency: "daily",
      priority: 0.6,
      images: [`${SITE_URL}/discover/events/${e.slug}/opengraph-image`],
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
    ];
  } catch {
    // Fall back to static routes only.
  }

  return [...staticRoutes, ...helpRoutes, ...dynamicRoutes, ...organizerRoutes];
}
