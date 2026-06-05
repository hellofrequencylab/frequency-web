import { redirect } from 'next/navigation'
import { DEFAULT_LEAD_FLOW } from '@/lib/onboarding/lead-flows'

// Bare /start → the default welcome router (ADR-125). Keeps one canonical render of
// each lead flow at /start/<flow>; this is just the friendly front door.
export default function StartPage() {
  redirect(`/start/${DEFAULT_LEAD_FLOW}`)
}
