import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Keep auth-walled app surfaces out of the index — crawlers hitting them only
// get redirected to /sign-in, wasting crawl budget. Mirror the PROTECTED_PATHS
// list in proxy.ts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/feed",
        "/broadcast",
        "/circles",
        "/channels",
        "/events",
        "/messages",
        "/people",
        "/search",
        "/crew",
        "/groups",
        "/hubs",
        "/nexuses",
        "/profile",
        "/admin",
        "/onboarding",
        "/settings",
        "/join/",
        "/unsubscribe",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
