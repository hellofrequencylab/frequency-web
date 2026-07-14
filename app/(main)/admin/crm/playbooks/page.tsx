import { redirect } from 'next/navigation'

// MERGED into the unified Intelligence page (/admin/crm/intelligence): the Playbooks registry, recent
// runs, and headline stats now live on the combined Resonance CRM surface (owner merge of Today +
// Playbooks + the Resonance Graph). This thin redirect keeps old links and bookmarks working. The
// Intelligence page keeps the janitor gate and the idempotent seedPlaybooks table sync this page had.
export default function PlaybooksPage() {
  redirect('/admin/crm/intelligence')
}
