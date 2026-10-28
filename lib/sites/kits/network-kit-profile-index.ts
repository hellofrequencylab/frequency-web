import type { KitNiche, SiteKit } from './types'

interface KitSummary { id: string; niche: KitNiche; theme: SiteKit['theme']; label: string; description: string }

/** The Network Theme Kit's thirteen profile kits for the editor's kit library and the theme page. Kept apart from KIT_INDEX so the
 *  public theme pages, which list KIT_INDEX by niche, and each theme's own tests stay as they are. The id is `network-kit-<niche>`.
 *  Labels and descriptions are the design system's own, in the voice guide's words (network-kit-profile-variants.test.tsx pins them to the kit). */
export const NETWORK_KIT_PROFILE_KIT_INDEX: readonly KitSummary[] = [
  { id: 'network-kit-general', niche: 'general', theme: 'NetworkKit', label: 'Networking group', description: 'A local group that meets, with a way to show up the first time.' },
  { id: 'network-kit-networks', niche: 'networks', theme: 'NetworkKit', label: 'Multi-chapter networks', description: 'Many chapters under one name: find a chapter, start one, and see what is happening everywhere.' },
  { id: 'network-kit-clubs', niche: 'clubs', theme: 'NetworkKit', label: 'Professional associations', description: 'Trade and professional associations: meetings, the member directory, dues and how to join.' },
  { id: 'network-kit-markets', niche: 'markets', theme: 'NetworkKit', label: 'Local business alliances', description: 'Shop-local alliances and business districts: member businesses, perks, the next market day and how to join as a business.' },
  { id: 'network-kit-hosts', niche: 'hosts', theme: 'NetworkKit', label: 'Mixers and socials', description: 'Evening mixers and social nights for professionals: what is on, who comes, and a list to hear about the next one.' },
  { id: 'network-kit-creators', niche: 'creators', theme: 'NetworkKit', label: 'Creative collectives', description: "Collectives of artists, makers and freelancers: the members' work, the shows and studio nights, and a way to join." },
  { id: 'network-kit-wellness', niche: 'wellness', theme: 'NetworkKit', label: 'Summits and retreats', description: 'Summits, retreats and member trips: dates, tickets, the agenda and a simple way to reserve.' },
  { id: 'network-kit-studios', niche: 'studios', theme: 'NetworkKit', label: 'Coworking communities', description: 'Shared workspaces where the community matters as much as the desk: passes, member events and who is in this week.' },
  { id: 'network-kit-nonprofits', niche: 'nonprofits', theme: 'NetworkKit', label: 'Community coalitions', description: 'Coalitions and civic groups that bring organizations together: the work, the meetings and how to take part.' },
  { id: 'network-kit-schools', niche: 'schools', theme: 'NetworkKit', label: 'Programs and accelerators', description: 'Programs, accelerators and host training: what you teach, when the next group starts and how to apply.' },
  { id: 'network-kit-coaches', niche: 'coaches', theme: 'NetworkKit', label: 'Mentorship circles', description: 'Mentor-led circles and one-to-one sessions that pair experienced members with people a few steps behind.' },
  { id: 'network-kit-venues', niche: 'venues', theme: 'NetworkKit', label: 'Clubhouses and hubs', description: "A members' clubhouse or community hub: the space, the calendar, and how to host your own event there." },
  { id: 'network-kit-faith', niche: 'faith', theme: 'NetworkKit', label: 'Peer advisory boards', description: 'Small, confidential peer boards of owners and leaders who meet to work on real decisions.' },
]
