import { redirect } from 'next/navigation'

// "How it works" has been retired into the pillar triptych: its content now lives
// on The Community (the people pillar). Old links and SEO survive via this server
// redirect to /the-community.
export default function HowItWorksPage() {
  redirect('/the-community')
}
