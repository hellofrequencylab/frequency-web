import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'
import { VeraConcierge } from '@/components/onboarding/vera-concierge'
import { FocusTemplate } from '@/components/templates'

// Vera-led onboarding (ADR-066 Phase D / ADR-047). The conversational step right
// after signup — her one job is getting the new member into a real circle, then
// stepping back. There's always a one-tap escape straight to /circles (doctrine §3:
// never trap them on Vera).
export const dynamic = 'force-dynamic'

export default async function VeraOnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Activation-funnel step 2 (ADR-075): reached Vera. Best-effort.
  const { data: prof } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (prof?.id) await track('onboarding.vera_opened', {}, prof.id)

  return (
    <main className="min-h-screen bg-canvas px-5 py-10 sm:px-8">
      <FocusTemplate
        width="narrow"
        divider={false}
        title="Settling in"
        description="Vera keeps this place running. She’ll help you find your people, then get out of your way."
        actions={
          <Link
            href="/circles"
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-subtle transition-colors hover:text-text"
          >
            Skip to circles <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        <VeraConcierge />
      </FocusTemplate>
    </main>
  )
}
