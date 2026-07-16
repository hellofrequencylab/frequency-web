import { redirect } from 'next/navigation'

// RETIRED into the unified Resonance CRM composer (/admin/crm/marketing): campaigns, funnels,
// drafts, and sent now live on ONE surface built on the block editor + lifecycle state machine +
// draft model. This route's old plain-textarea composer and its parallel `sendCampaign` action
// (which inserted a fresh status:'sent' row straight from a textarea, bypassing the block editor,
// the state machine, and the draft model) have been removed. This thin redirect keeps old links
// and bookmarks working.
export default function CampaignsPage() {
  redirect('/admin/crm/marketing')
}
