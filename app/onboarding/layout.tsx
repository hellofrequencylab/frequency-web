import type { Metadata } from 'next'

// The onboarding/induction flow is a public-facing funnel, not a product page.
// noindex so search + answer engines never rank "Join the Beta" as the primary
// entry to Frequency (the marketing pillars and /discover are the indexable front
// door). Applies to every /onboarding/* route.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children
}
