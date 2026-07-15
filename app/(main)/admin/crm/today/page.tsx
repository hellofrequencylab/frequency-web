import { redirect } from 'next/navigation'

// MERGED into the unified Intelligence page (/admin/crm/intelligence): Vera Today now lives as the
// MAIN column of the combined Resonance CRM surface (owner merge of Today + Playbooks + the Resonance
// Graph). This thin redirect keeps old links and bookmarks working. The Intelligence page keeps the
// janitor gate this page had.
export default function TodayPage() {
  redirect('/admin/crm/intelligence')
}
