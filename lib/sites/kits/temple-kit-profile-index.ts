import type { KitNiche, SiteKit } from './types'

interface KitSummary { id: string; niche: KitNiche; theme: SiteKit['theme']; label: string; description: string }

/** The Temple Theme Kit's thirteen profile kits for the editor's kit library. Kept apart from KIT_INDEX so the public theme
 *  pages, which list KIT_INDEX by niche, and each theme's own tests stay as they are. The id is `temple-kit-<niche>`. Labels
 *  are the design system's profile names (lib/theme/temple-kit.ts); descriptions say who the kit is for, in the voice guide's
 *  words (temple-kit-profile-variants.test.tsx pins both to the kits). */
export const TEMPLE_KIT_PROFILE_KIT_INDEX: readonly KitSummary[] = [
  { id: 'temple-kit-general', niche: 'general', theme: 'TempleKit', label: 'Temple', description: 'A temple house that runs gatherings, programs and ceremonies, and hires its rooms: what is open, how to take part and how to hold the space.' },
  { id: 'temple-kit-coaches', niche: 'coaches', theme: 'TempleKit', label: 'Coaches and healers', description: 'Coaches, therapists and healers who work one to one and in small groups.' },
  { id: 'temple-kit-studios', niche: 'studios', theme: 'TempleKit', label: 'Studios and instructors', description: 'Yoga, dance, fitness and art studios that run classes and memberships.' },
  { id: 'temple-kit-hosts', niche: 'hosts', theme: 'TempleKit', label: 'Event hosts', description: 'People who run nights, gatherings and series: what is coming up, how to join, a list to stay in touch.' },
  { id: 'temple-kit-venues', niche: 'venues', theme: 'TempleKit', label: 'Venues', description: 'Rooms, halls and spaces for hire: show the room, the calendar and how to book it.' },
  { id: 'temple-kit-nonprofits', niche: 'nonprofits', theme: 'TempleKit', label: 'Nonprofits', description: 'Charities and community groups: explain the work plainly and make it easy to come along, volunteer or give.' },
  { id: 'temple-kit-networks', niche: 'networks', theme: 'TempleKit', label: 'Networks', description: 'Many chapters under one name: find a chapter, start one, and see what is happening everywhere.' },
  { id: 'temple-kit-creators', niche: 'creators', theme: 'TempleKit', label: 'Creators', description: 'Artists, musicians, makers and podcasters: the work, the shows and a list of people who want to hear from you.' },
  { id: 'temple-kit-schools', niche: 'schools', theme: 'TempleKit', label: 'Schools and programs', description: 'Workshops, courses, camps and training: what you teach, when the next one starts and how to enroll.' },
  { id: 'temple-kit-clubs', niche: 'clubs', theme: 'TempleKit', label: 'Clubs and groups', description: 'Hobby clubs, leagues, run and book clubs and co-ops: meetups, members and a way to join.' },
  { id: 'temple-kit-faith', niche: 'faith', theme: 'TempleKit', label: 'Spiritual community', description: 'Churches, sanghas, temples and centers: when you gather, the small groups, and a way to give.' },
  { id: 'temple-kit-wellness', niche: 'wellness', theme: 'TempleKit', label: 'Wellness and retreats', description: 'Spas, retreat centers and wellness studios: treatments, packages, retreats and a simple way to book.' },
  { id: 'temple-kit-markets', niche: 'markets', theme: 'TempleKit', label: 'Markets and festivals', description: 'Farmers markets, makers markets and festivals: the next dates, who is there, and how to apply as a vendor.' },
]
