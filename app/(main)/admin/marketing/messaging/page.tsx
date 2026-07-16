import { redirect } from 'next/navigation'

// RETIRED into the unified Resonance CRM composer (/admin/crm/marketing): the Messaging listing
// (campaigns + funnels, the KPI row, and the console) now lives on ONE surface there, reusing the
// same messaging console over the gated, draft-first send pipeline. The working editors this page
// linked out to remain (messaging/new, the funnel flow, the control panel). This thin redirect
// keeps old links and bookmarks to the listing working.
export default function MessagingPage() {
  redirect('/admin/crm/marketing')
}
