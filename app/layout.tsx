import type { Metadata, Viewport } from "next";
import { Nunito, Geist_Mono, Anton } from "next/font/google";
import "./globals.css";
import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from "@/lib/site";
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
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
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
const themeScript = `(function(){try{var s=localStorage.getItem('freq-theme');if(!s){var legacy=localStorage.getItem('theme');if(legacy==='dark'||legacy==='light'||legacy==='system'){s=legacy;localStorage.setItem('freq-theme',legacy);}}var sys=window.matchMedia('(prefers-color-scheme:dark)').matches;var dark=s==='dark'||((s==='system'||!s)&&sys);document.documentElement.classList.toggle('dark',dark);var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',dark?'#16130E':'#FBFAF6');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}
    >
      <head>
        {/* Theme script must run synchronously before any paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Site-wide structured data for search/answer engines */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        {/* GA4 — inert unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set in production */}
        <GoogleAnalytics />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
