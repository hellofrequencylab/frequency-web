import Link from 'next/link'
import { QrCode } from 'lucide-react'

export const dynamic = 'force-static'

// Calm dead-end for a scanned code that's missing, retired, expired, or
// misconfigured. The /q resolver redirects here rather than 404ing.
export default function CodeUnavailablePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-canvas">
      <div className="max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-elevated text-muted flex items-center justify-center">
          <QrCode className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-text mt-4">This code isn’t active</h1>
        <p className="text-sm text-muted mt-2">
          It may have expired or been retired. Check with whoever shared it.
        </p>
        <Link href="/" className="inline-block mt-5 text-sm font-semibold text-primary hover:underline">
          Go to Frequency →
        </Link>
      </div>
    </div>
  )
}
