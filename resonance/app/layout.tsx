import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Resonance",
  description: "A social hangout world.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Inter (UI) + Space Grotesk (display), per docs/DESIGN.md §4. Loaded
            at runtime so the build needs no font network access; a next/font
            self-host pass is a polish follow-up. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- intentional
            runtime <link> so the build needs no font network; next/font self-host
            is a tracked follow-up (DESIGN.md §13.F). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
