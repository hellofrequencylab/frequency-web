import Link from 'next/link'
import { QrCode } from 'lucide-react'
import { FocusTemplate } from '@/components/templates'

export const dynamic = 'force-static'

// Calm dead-end for a scanned code that's missing, retired, expired, or
// misconfigured. The /q resolver redirects here rather than 404ing.
export default function CodeUnavailablePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-canvas">
      <FocusTemplate
        title="This code isn’t active"
        description="It may have expired or been retired. Check with whoever shared it."
        width="narrow"
        divider={false}
      >
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-elevated text-muted flex items-center justify-center">
            <QrCode className="w-7 h-7" />
          </div>
          <Link href="/" className="inline-block mt-5 text-sm font-semibold text-primary hover:underline">
            Go to Frequency →
          </Link>
        </div>
      </FocusTemplate>
    </div>
  )
}
