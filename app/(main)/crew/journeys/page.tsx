import { redirect } from 'next/navigation'

// Legacy path. The season's official tracks live at /crew/quests now (ADR-152:
// The Quest -> Seasonal Quest -> Journeys -> Practices). Keep the redirect.
export default function JourneysRedirect() {
  redirect('/crew/quests')
}
