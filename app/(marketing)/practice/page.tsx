import { permanentRedirect } from 'next/navigation'

// /practice is no longer a primary page. Practices, Journeys, and the Mindless
// timer are explained on The Quest, so this route is retired with a permanent
// (308) redirect there. Old links and SEO survive.
export default function PracticeRedirect() {
  permanentRedirect('/the-quest')
}
