import type { Metadata, Viewport } from "next";
import { Nunito, Geist_Mono, Anton } from "next/font/google";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";
import { JsonLd } from "@/components/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/jsonld";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { resolveTheme } from "@/lib/theme/server/resolve";
import { loadActiveThemeCss, resolveActiveOccasionSlug } from "@/lib/theme/server/themes";
import { ThemeProvider } from "@/components/theme/theme-provider";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Matches the community canvas (--color-canvas). The pre-paint script
  // below also writes this meta dynamically so it stays correct when the
  // user toggles modes.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFAF6" },
    { media: "(prefers-color-scheme: dark)",  color: "#16130E" },
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
const themeScript = `(function(){try{var s=localStorage.getItem('freq-theme');if(!s){var legacy=localStorage.getItem('theme');if(legacy==='dark'||legacy==='light'||legacy==='system'){s=legacy;localStorage.setItem('freq-theme',legacy);}}var sys=window.matchMedia('(prefers-color-scheme:dark)').matches;var dark=s==='dark'||((s==='system'||!s)&&sys);document.documentElement.classList.toggle('dark',dark);var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',dark?'#16130E':'#FBFAF6');var skin=localStorage.getItem('freq-skin');if(skin){document.documentElement.setAttribute('data-skin',skin);}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the three theming axes server-side (skin / generation / occasion) so the
  // data-attributes below are present in the first byte — no flash, and they compose with
  // the .dark class the pre-paint script sets. resolveTheme() reads the `fxtheme` cookie via
  // next/headers, which opts this root layout into dynamic rendering. That's acceptable here:
  // CSS does all the visual work, so the streamed body stays theme-agnostic and only ~tens of
  // bytes of attributes vary per request. We deliberately do NOT cache around it in this change.
  const theme = await resolveTheme();

  // Effective occasion (the OCCASION time axis): a member/code pin wins when resolveTheme
  // already settled on a non-'none' occasion (cookie pin or a code-registry window match);
  // otherwise auto-schedule from the DB occasion windows authored in Theme Studio. The DB
  // resolver is fail-safe ('none' on any error / missing table), so this never blocks render.
  const occasion =
    theme.occasion !== "none"
      ? theme.occasion
      : await resolveActiveOccasionSlug(new Date());

  // Data-driven themes (docs/THEME.md): render the active DB skin/occasion theme as a scoped
  // <style> whose higher-specificity selectors (html[data-skin] / html.dark[data-skin], and the
  // data-occasion equivalents) override the code DAWN/skin tokens for the active value. FAIL-SAFE:
  // returns '' when the themes table/rows are absent, so the code CSS skins stay the fallback.
  // Placed late in <head> (after the pre-paint themeScript) so source order plus specificity win.
  const themeCss = await loadActiveThemeCss({ skin: theme.skin, occasion });

  return (
    <html
      lang="en"
      data-skin={theme.skin}
      data-generation={theme.generation}
      data-occasion={occasion === "none" ? undefined : occasion}
      className={`${nunito.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <head>
        {/* Theme script must run synchronously before any paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Data-driven theme overrides. Empty (and inert) unless an active DB theme matches
            the resolved skin/occasion; sits after the pre-paint script so it wins on order. */}
        {themeCss ? (
          <style id="fx-theme" dangerouslySetInnerHTML={{ __html: themeCss }} />
        ) : null}
        {/* Site-wide structured data for search/answer engines */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        {/* GA4 — inert unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set in production */}
        <GoogleAnalytics />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider value={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
