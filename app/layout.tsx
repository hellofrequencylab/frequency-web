import type { Metadata, Viewport } from "next";
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
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, FOUNDING_PLACE } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/jsonld";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";

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
// body face; these load the ones not already on <html>. next/font self-hosts them and only downloads the
// bytes when a glyph actually renders (font-display: swap), so a Space that never uses the theme pays no
// cost. Variable fonts where possible; PT Serif + Atkinson need explicit weights.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap" });
const ptSerif = PT_Serif({ variable: "--font-pt-serif", subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], display: "swap" });
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], display: "swap" });
const atkinson = Atkinson_Hyperlegible({ variable: "--font-atkinson", subsets: ["latin"], weight: ["400", "700"], display: "swap" });

// The first-paint theme-color values, kept in one place so the viewport metadata and the pre-paint
// themeScript below cannot drift. They mirror --color-canvas (light) and --color-ink (dark) in
// app/globals.css; the pre-paint script must inline a literal (it runs before CSS loads), so these
// are the single source for that one literal pair (app-shell reads the live CSS vars at runtime).
const THEME_COLOR_LIGHT = '#FBFAF6' // token-ok: pre-paint literal (runs before CSS; mirrors --color-canvas)
const THEME_COLOR_DARK = '#16130E' // token-ok: pre-paint literal (runs before CSS; mirrors --color-ink)

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale / userScalable cap: blocking pinch-zoom fails WCAG 1.4.4 / 1.4.10
  // (low-vision + older users on mobile could not magnify any page). Zoom stays enabled
  // site-wide; the DAWN base font size already avoids iOS input-focus auto-zoom.
  viewportFit: "cover",
  // Matches the community canvas (--color-canvas). The pre-paint script
  // below also writes this meta dynamically so it stays correct when the
  // user toggles modes.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
    { media: "(prefers-color-scheme: dark)",  color: THEME_COLOR_DARK },
  ],
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

// Inline script. Runs synchronously before first paint so the .dark class
// and <meta name="theme-color"> are correct on the first frame (prevents the
// dark-mode flash). Reads localStorage('freq-theme'): 'light' | 'dark' |
// 'system' | null; defaults to 'system' per the Dawn spec. We also migrate
// the legacy 'theme' key one-time so existing users don't get reset.
//
// Skin preview override: after resolving dark mode, it also reads
// localStorage('freq-skin'); if set, it writes that value to `data-skin` on
// <html> so a skin can be previewed globally (including marketing pages)
// without a real Space. Real Spaces still render `data-skin` server-side on the
// shell root (no flash); the skin CSS selectors match both <html> and the shell
// div. The value is trusted blind — an unknown skin is a harmless CSS no-op.
const themeScript = `(function(){try{var s=localStorage.getItem('freq-theme');if(!s){var legacy=localStorage.getItem('theme');if(legacy==='dark'||legacy==='light'||legacy==='system'){s=legacy;localStorage.setItem('freq-theme',legacy);}}var sys=window.matchMedia('(prefers-color-scheme:dark)').matches;var dark=s==='dark'||((s==='system'||!s)&&sys);document.documentElement.classList.toggle('dark',dark);var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',dark?'${THEME_COLOR_DARK}':'${THEME_COLOR_LIGHT}');var skin=localStorage.getItem('freq-skin');if(skin){document.documentElement.setAttribute('data-skin',skin);}}catch(e){}})();`;

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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Site-wide structured data for search/answer engines. The Organization
            node carries the founding location (city-level only) so engines can
            resolve Frequency as a real, place-rooted entity. */}
        <JsonLd data={[organizationSchema({ foundingLocation: FOUNDING_PLACE }), websiteSchema()]} />
        {/* GA4 — inert unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set in production */}
        <GoogleAnalytics />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
