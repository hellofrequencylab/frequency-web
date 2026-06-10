import { redirect } from 'next/navigation'

// The Journeys admin surface moved into the content suite (ADR-211). This stub
// keeps old links and bookmarks working.
export default function AdminQuestsRedirect() {
  redirect('/admin/content/journeys')
}
