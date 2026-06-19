import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Resonance",
  description: "A social hangout world.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
