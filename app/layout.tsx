import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import {
  Nunito,
  Geist_Mono,
  Anton,
  Playfair_Display,
  Caveat,
  Space_Grotesk,
  Fraunces,
  PT_Serif,
  Fredoka,
  Lexend,
  Atkinson_Hyperlegible,
} from "next/font/google";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, FOUNDING_PLACE, SOCIAL_PROFILES } from "@/lib/site";
import { THEME_BOOTSTRAP_SCRIPT, THEME_COLOR_LIGHT } from '@/lib/theme/mode'
import { ThemeModeSync } from '@/components/layout/theme-mode-sync'
import { JsonLd } from "@/components/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/jsonld";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { WebVitals } from "@/components/analytics/web-vitals";
import { Analytics } from "@vercel/analytics/next";

// Nunito: closest Google Font to the Frequency brand logo's rounded, bold letterforms.
// Weights: 400 body, 600 semibold, 700 bold, 800 extrabold, 900 black (headings/branding).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Anton: heavy condensed display face for the public marketing headlines
// (editorial, fills the width). Used via the `.font-display` utility; the
// in-app product keeps Nunito. Single weight (400) — it's already very heavy.
const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// Member-selectable Spotlight fonts (lib/spotlight/theme.ts maps ids → these vars). Loaded
// once on <html> so they self-host and cascade to the public /spotlight route. Variable
// fonts where possible (Caveat needs explicit weights).
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], display: "swap" });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const spaceGrotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], display: "swap" });

// Space-page THEME fonts (ADR-578, lib/theme/space-themes.ts). Each Space profile theme pairs a display +
// body face; these load the ones not already on <html>. next/font self-hosts them, and `preload: false`
// keeps the five theme-only faces out of every page's <link rel="preload"> — without it next/font preloads
// each registered face on EVERY route, so pages that never render a themed Space would still fetch all five.
// (The browser then downloads a face only when its @font-face is actually matched by rendered text.)
// Fraunces additionally loads its `opsz` + `SOFT` optical axes: the editorial theme's light display
// treatment (font-variation-settings in globals.css) needs them, and next/font ships only `wght` by default.
// Variable fonts where possible; PT Serif + Atkinson need explicit weights.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap", axes: ["opsz", "SOFT"], preload: false });
const ptSerif = PT_Serif({ variable: "--font-pt-serif", subsets: ["latin"], weight: ["400", "700"], display: "swap", preload: false });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], display: "swap", preload: false });
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], display: "swap", preload: false });
const atkinson = Atkinson_Hyperlegible({ variable: "--font-atkinson", subsets: ["latin"], weight: ["400", "700"], display: "swap", preload: false });

// The first-paint theme-color values and the pre-paint bootstrap both come from lib/theme/mode.ts,
// which is the single statement of the light/dark law (see its header). This file used to re-declare
// the two literals AND hand-roll the script; both are now imported, so the viewport metadata, the
// bootstrap and the induction's light lock cannot disagree about what "light" is.

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale / userScalable cap: blocking pinch-zoom fails WCAG 1.4.4 / 1.4.10
  // (low-vision + older users on mobile could not magnify any page). Zoom stays enabled
  // site-wide; the DAWN base font size already avoids iOS input-focus auto-zoom.
  viewportFit: "cover",
  // ONE theme-color, light, with NO `media` split (changed 2026-09-11 — see ADR-1323).
  //
  // The media-split pair was two bugs at once, and both showed on exactly the surface this pass is
  // about: a phone. `themeColor: [{light}, {dark}]` renders TWO <meta name="theme-color"> tags, and
  //
  //   1. the pre-paint bootstrap writes to `querySelector('meta[name="theme-color"]')`, which is the
  //      FIRST of them — so on a device whose OS is in dark mode the second tag kept winning and the
  //      status bar stayed ink no matter what the script resolved; and
  //   2. it hands the decision to `prefers-color-scheme` in the first place, which is precisely the
  //      thing that no longer decides mode here. A signed-out visitor is light now (they have no
  //      account, so they cannot be in dark), and their status bar has to agree with their page.
  //
  // So the static value is the canonical light canvas, unconditionally, and the bootstrap repaints
  // it to --color-ink for the one viewer who actually resolves dark. One tag, one writer, no race.
  themeColor: THEME_COLOR_LIGHT,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.json",
  // Search + answer-engine presentation limits. Without these, every indexable page is served
  // at Google's defaults: a THUMBNAIL image and a capped snippet. The whole per-entity OG card
  // investment (events, spaces, circles, spotlight, help) only reaches a result page at full
  // size if `max-image-preview: large` is set, and AI Overviews are multimodal.
  //
  // ⚠️ `robots` is a NESTED metadata field: a route segment that defines it OVERWRITES this
  // wholesale rather than deep-merging (Next 16, generate-metadata docs). That is correct here —
  // the pages that set `robots: { index: false }` are noindexed, so dropping the googleBot block
  // on them changes nothing. But it means you cannot set half of this object in a child segment
  // and expect the rest to survive.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Frequency",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};


// The ROOT layout stays STATIC (no per-request cookie/DB reads) so the public marketing +
// discover pages keep prerendering (static/ISR). All data-driven theming — the personal
// `fxtheme` cookie, the active DB skin/occasion `<style>`, and the data-* axis attributes — is
// resolved in the authed in-app shell instead (app/(main)/layout.tsx), which is dynamic by
// nature. The public site renders the canonical default look; the `.dark` mode and a `freq-skin`
// design preview are still applied client-side by the pre-paint script below (no SSR cost).
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} ${anton.variable} ${playfair.variable} ${caveat.variable} ${spaceGrotesk.variable} ${fraunces.variable} ${ptSerif.variable} ${fredoka.variable} ${lexend.variable} ${atkinson.variable} h-full antialiased`}
    >
      <head>
        {/* Theme script must run synchronously before any paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        {/* Site-wide structured data for search/answer engines. The Organization
            node carries the founding location (city-level only) so engines can
            resolve Frequency as a real, place-rooted entity. */}
        <JsonLd data={[organizationSchema({ foundingLocation: FOUNDING_PLACE, sameAs: SOCIAL_PROFILES }), websiteSchema()]} />
        {/* GA4 — inert unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set in production */}
        <GoogleAnalytics />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Anonymous Core Web Vitals capture (no cookies, no profile link — keeps the
            root layout static). Member-tied trackers stay in the (main) layout. */}
        {/* Keeps the resolved mode true after the first paint — client-side navigations into the
            public community tree, rotation across the mobile breakpoint, OS changes, other tabs.
            Renders null. In <Suspense> because usePathname suspends on unresolved dynamic params
            once `cacheComponents` is on (next/dist/docs .../use-pathname.md); it is off today, so
            this costs nothing and stops the flag flip from failing the build later. */}
        <Suspense fallback={null}>
          <ThemeModeSync />
        </Suspense>
        <WebVitals />
        {/* Vercel Web Analytics (OWN-047). The dashboard toggle only opens the endpoint — this
            script is what sends a pageview, so the project reported zero for as long as it was
            enabled without this. It covers the SIGNED-OUT funnel, which is the gap: the repo's own
            nav.page_view events cover members well and see nothing of the ~20 public marketing
            surfaces or the /for/* operator doors, which is where every acquisition decision is
            made. Cookie-free and ~1KB, so it costs the shell budget nothing meaningful. */}
        <Analytics />
        {children}
        {/* The anonymous live-chat widget (ADR-816) no longer mounts here: corner arbitration
            (docs/CHAT-SHELL-PLAN.md §2) gives each surface ONE bottom-right owner. The widget
            mounts in the PUBLIC layouts ((marketing), (help), /discover); the member (main)
            shell's corner belongs to the dock (VeraLauncher), so the two can never stack. */}
      </body>
    </html>
  );
}
