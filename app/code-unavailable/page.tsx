import Link from 'next/link'
import { QrCode } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'
import { FrequencyUtilityCard } from '@/components/frequency/site/pages/legal/legal-reading'
import { SITE_DESIGN } from '@/lib/theme/design'

export const dynamic = 'force-static'

// Utility dead-end: never worth indexing under the generic site title.
export const metadata = { robots: { index: false } }

// Calm dead-end for a scanned code that's missing, retired, expired, or
// misconfigured. The /q resolver redirects here rather than 404ing.
export default function CodeUnavailablePage() {
  // Under Frequency (ADR-1737, build-time): the same words in the site's one-card landing, on Commons
  // (app/code-unavailable/layout.tsx). DAWN is unchanged below.
  if (SITE_DESIGN === 'frequency') {
    return (
      <FrequencyUtilityCard
        title="This code isn’t active"
        description="It may have expired or been retired. Check with whoever shared it."
      >
        <Link href="/" className="btn pa">
          Go to Frequency →
        </Link>
      </FrequencyUtilityCard>
    )
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-canvas">
      <FocusTemplate
        title="This code isn’t active"
        description="It may have expired or been retired. Check with whoever shared it."
        width="narrow"
        divider={false}
      >
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-card bg-surface-elevated text-muted flex items-center justify-center">
            <QrCode className="w-7 h-7" />
          </div>
          <Link href="/" className="inline-block mt-5 text-body-sm font-semibold text-primary hover:underline">
            Go to Frequency →
          </Link>
        </div>
      </FocusTemplate>
    </div>
  )
}
