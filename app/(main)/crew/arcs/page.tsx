import { redirect } from 'next/navigation'

// Arcs were renamed Journeys (ADR-085). Keep the old path working.
export default function ArcsRedirect() {
  redirect('/crew/journeys')
}
