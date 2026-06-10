import type { Metadata } from 'next'

// The Pages admin (page editor, Beta splash editor, Home SEO editor, splash
// sequences) is janitor-gated. Belt-and-braces: noindex so an editorial surface
// can never be crawled even if an auth edge case ever exposed it.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function PagesAdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
