import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Keep auth-walled app surfaces out of the index — crawlers hitting them only
// get redirected to /sign-in, wasting crawl budget. Mirror the PROTECTED_PATHS
// list in proxy.ts. One DISALLOW constant is shared by the wildcard rule and
// every per-bot rule so the two never drift.
const DISALLOW = [
  "/api/",
  "/feed",
  "/broadcast",
  "/circles",
  "/practices",
  "/channels",
  // /events + /events/<slug> are PUBLIC (SEO/AIO); only the create flow stays out of the
  // index. Host manage sub-routes are proxy-protected (anon gets redirected), so a crawler
  // never indexes them even though they aren't listed here.
  "/events/new",
  // App-shell TWINS of canonical /discover surfaces — these pages canonical to
  // /discover/partners|journeys, so keep crawlers off the twins to stop them cannibalizing
  // the canonicals. (/discover/* is NOT disallowed.) NOTE: /store is deliberately NOT listed —
  // its /store/<id> product pages are self-canonical + indexable (Product schema), so a blanket
  // /store rule would deindex them; the /store index carries its own noindex instead.
  "/partners",
  "/journeys",
  // /spaces/directory is the app-shell twin of the canonical /discover/spaces (it canonicals there),
  // so keep crawlers off it. NOT a blanket "/spaces" rule: the /spaces/<slug> Space profile pages are
  // self-canonical + indexable (LocalBusiness/Organization schema), which a "/spaces" rule would deindex.
  "/spaces/directory",
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
  // Capture funnel landing paths (warm-intro accept, check-in, unlock, exchange). Each page
  // already sets per-page noindex; disallowing here is belt-and-suspenders so crawlers never
  // spend budget on a single-use, token-gated URL.
  "/intro",
  "/checkin",
  "/unlock",
  "/exchange",
];

// AI answer engines and their crawlers. We name each one explicitly (allow "/",
// same disallow list as the wildcard) so every engine is unambiguously welcomed
// on public pages. AI citation is a primary acquisition channel (CONTENT-VOICE
// §8), so we opt in rather than rely on the "*" default: GPTBot (OpenAI training),
// OAI-SearchBot + ChatGPT-User (ChatGPT search / browsing), ClaudeBot + Claude-Web
// + anthropic-ai (Anthropic), PerplexityBot, Applebot + Applebot-Extended (Apple /
// Apple Intelligence), Google-Extended (Gemini / Vertex), and CCBot (Common Crawl,
// which many models train on).
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Applebot",
  "Applebot-Extended",
  "Google-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
