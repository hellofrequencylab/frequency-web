import { redirect } from 'next/navigation'

// Quests and Journeys were unified into "Journeys" (S1). "The Quest" stays the
// game name; the journey unit (sets of practices) lives at /journeys.
export default function QuestsRedirect() {
  redirect('/journeys')
}
