import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'

// The shared chrome for a PUBLIC lead-capture surface (front doors 2 to 5). A centered card with the
// Frequency wordmark, mirroring the double-opt-in confirm / unsubscribe surfaces — a self-contained
// transactional page OUTSIDE the authed app shell (no rail, no nav). Presentational + server-friendly.
export function CaptureShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-block text-xl font-black tracking-tight text-text">
          frequency
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <FocusTemplate
            eyebrow={eyebrow}
            title={title}
            description={description}
            width="narrow"
            divider={false}
          >
            {children}
          </FocusTemplate>
        </div>
      </div>
    </div>
  )
}
