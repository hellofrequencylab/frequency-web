import { NOT_FOUND_METADATA } from '@/lib/seo/not-found-metadata'
import { FrequencyHelpNotFound } from '@/components/frequency/site/pages/help/frequency-help-pages'

// One robots directive in the head, never two (LIVE-214, ADR-1276): see the module.
export const metadata = NOT_FOUND_METADATA

// The help center's not-found wears the help hero, inside the site shell the (help) layout renders.
export default function NotFound() {
  return <FrequencyHelpNotFound />
}
