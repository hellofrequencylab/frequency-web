import { permanentRedirect } from 'next/navigation'

// "How it works" has been retired into the pillar triptych: its content now lives
// on The Community (the people pillar). Old links and SEO survive via this PERMANENT
// (308) redirect to /the-community, so ranking signals consolidate onto the canonical
// page instead of being held by a temporary (307) hop (matches /build).
export default function HowItWorksPage() {
  permanentRedirect('/the-community')
}
