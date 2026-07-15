import { redirect } from 'next/navigation'

// MERGED into the unified Intelligence page (/admin/crm/intelligence): the Resonance Graph (the metric
// row + the strongest-connections list) now lives on the combined Resonance CRM surface (owner merge
// of Today + Playbooks + the Resonance Graph). This thin redirect keeps old links and bookmarks
// working. The graph blocks keep their consent-first, insights-staff gate on the new page (applied per
// block, so the per-member relationship graph is never over-surfaced).
export default function ResonanceGraphPage() {
  redirect('/admin/crm/intelligence')
}
