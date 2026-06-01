import type { Metadata } from 'next'
import { WelcomeExperience } from '@/components/welcome/welcome-experience'

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
}

// The conversational onboarding funnel (prototype). A full-screen experience:
// the splash tears open, the sand canvas greets the visitor, and a conversation
// sets up their profile while the app is revealed from the interior out.
// Front-end only for now — auth (inline email OTP) + persistence land next.
export default function WelcomePage() {
  return <WelcomeExperience />
}
