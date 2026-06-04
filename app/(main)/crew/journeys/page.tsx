import { redirect } from 'next/navigation'

// The gamified engine was renamed Journeys -> Quests (ADR-087). Keep the old path.
export default function JourneysRedirect() {
  redirect('/crew/quests')
}
