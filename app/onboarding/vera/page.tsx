import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VeraConcierge } from '@/components/onboarding/vera-concierge'

// Vera-led onboarding (ADR-066 Phase D). A conversational alternative to the
// deterministic tour — she gets you toward a real circle or person, then steps back.
export const dynamic = 'force-dynamic'

export default async function VeraOnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-1 text-xl font-bold text-text">Settling in</h1>
      <p className="mb-6 text-sm text-muted">
        Vera keeps this place running. She&rsquo;ll help you find your people — and get out of your way.
      </p>
      <VeraConcierge />
    </div>
  )
}
