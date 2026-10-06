import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Keep auth-walled app surfaces out of the index — crawlers hitting them only
// get redirected to /sign-in, wasting crawl budget. Mirror the PROTECTED_PATHS
// list in proxy.ts. One DISALLOW constant is shared by the wildcard rule and
// every per-bot rule so the two never drift.
const DISALLOW = [
  "/api/",
  "/feed",
  "/nearby",
  "/circles",
  "/practices",
  "/channels",
  // /events + /events/<slug> are PUBLIC (SEO/AIO); only the create flow stays out of the
  // index. Host manage sub-routes are proxy-protected (anon gets redirected), so a crawler
  // never indexes them even though they aren't listed here.
  // `$` anchors the rule (Google and Bing honour it): a bare "/events/new" is a PREFIX rule and
  // would also hide every public event whose slug starts with "new" (SCAN-654). The `?` arm keeps
  // the composer's own query forms (?circle=, ?space=, ?duplicate=) out of the index.
  "/events/new$",
  "/events/new?",
  // App-shell TWINS of canonical /discover surfaces — these pages canonical to
  // /discover/partners|journeys, so keep crawlers off the twins to stop them cannibalizing
  // the canonicals. (/discover/* is NOT disallowed.) NOTE: the four marketplace indexes —
  // /store, /market, /housing, /classifieds — are deliberately NOT listed, but only so a
  // PREFIX rule on any of the four does not catch the /<vertical>/<id> detail URLs beneath
  // them. Those detail pages are self-canonical + indexable (Product / Accommodation schema)
  // and are what app/sitemap.ts advertises. The indexes themselves are members-only
  // (lib/nav/public-detail-routes.ts allows the detail patterns alone): an anonymous visitor
  // or crawler fetching /store or /market gets a 307 to /, so they are not crawl hubs. Detail
  // pages are discovered through app/sitemap.ts and the Space shop pages (SCAN-786).
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
  // The Mindless timer. Added to PROTECTED_PATHS in the same change (LIVE-136) so a sign-in
  // triggered from the timer keeps the timer as its destination; a crawler reaching it only
  // gets the 307 to /sign-in, so it belongs here too.
  "/on-air",
  "/groups",
  "/profile",
  "/admin",
  "/onboarding",
  "/settings",
  // The whole /join segment (ADR-1090): the Funnels induction at /join, the Funnel
  // splashes and Circle invite tokens at /join/<slug>, and /join/complete|preview.
  // Same intent the pieces carried before the move — the induction was under the
  // "/onboarding" rule and each splash sets per-page noindex (formerly /beta/<slug>).
  "/join",
  "/unsubscribe",
  "/manage-emails",
  // Capture funnel landing paths (warm-intro accept, check-in, unlock, exchange, event RSVP). Each page
  // already sets per-page noindex; disallowing here is belt-and-suspenders so crawlers never
  // spend budget on a single-use, token-gated URL.
  "/intro",
  "/checkin",
  "/unlock",
  "/exchange",
  "/rsvp",
  // One-time claim landings (operator outreach → the real owner claims their seeded
  // Space/listing/event). Same shape as the capture funnel above: token-gated, single-use,
  // and the Space one renders the SAME block body as the canonical /spaces/<slug> profile,
  // so an indexed copy would cannibalize it exactly like the /spaces/directory twin would.
  // The pages that render also carry their own noindex; /events/claim only ever redirects.
  "/spaces/claim/",
  "/listings/claim/",
  "/events/claim/",
  // QR splash landings (/q/<token>) and the QR lead scan/unsubscribe surface (/u/). Same
  // shape as the capture funnel: token-attributed, single-purpose 200s that would pollute
  // the index and the scan attribution if crawled. The splash HTML also carries its own
  // noindex meta (lib/qr/splash-render.ts), matching the belt-and-suspenders pattern above.
  "/q/",
  "/u/",
];

// AI answer engines and their crawlers. We name each one explicitly (allow "/",
// same disallow list as the wildcard) so every engine is unambiguously welcomed
// on public pages. AI citation is a primary acquisition channel (CONTENT-VOICE
// §8), so we opt in rather than rely on the "*" default: GPTBot (OpenAI training),
// OAI-SearchBot + ChatGPT-User (ChatGPT search / browsing), ClaudeBot + Claude-Web
// + Claude-User + Claude-SearchBot + anthropic-ai (Anthropic crawl / on-demand /
// search), PerplexityBot + Perplexity-User, Applebot + Applebot-Extended (Apple /
// Apple Intelligence), Google-Extended (Gemini / Vertex), Meta-ExternalAgent +
// Meta-ExternalFetcher (Meta AI), Amazonbot (Alexa/Rufus), DuckAssistBot
// (DuckDuckGo AI), and CCBot (Common Crawl, which many models train on).
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "Google-Extended",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "Amazonbot",
  "DuckAssistBot",
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
