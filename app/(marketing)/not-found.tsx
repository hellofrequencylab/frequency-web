import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { SiteNotFound } from '@/components/frequency/site/shell/site-status'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

export default function NotFound() {
  // The website's not-found wears the kit's hero, inside the site shell the (marketing) layout renders.
  return <SiteNotFound />
}
