import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import {
  getTopicalChannels,
  getPublicCircles,
  getPublicEvents,
} from "@/lib/discover";
import { getAllArticles, getAllCategories } from "@/lib/help/content";

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
    { url: `${SITE_URL}/discover/topics`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
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
  try {
    const [channels, circles, events] = await Promise.all([
      getTopicalChannels(),
      getPublicCircles(200),
      getPublicEvents(200),
    ]);

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

    const eventRoutes: MetadataRoute.Sitemap = events.map((e) => ({
      url: `${SITE_URL}/discover/events/${e.slug}`,
      lastModified: new Date(e.starts_at),
      changeFrequency: "daily",
      priority: 0.6,
    }));

    dynamicRoutes = [...topicRoutes, ...circleRoutes, ...eventRoutes];
  } catch {
    // Fall back to static routes only.
  }

  return [...staticRoutes, ...helpRoutes, ...dynamicRoutes];
}
