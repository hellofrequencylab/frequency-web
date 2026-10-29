import { SegmentedLinks } from '@/components/ui/segmented-control'
import { audienceHref, audienceLinks, type CalendarAudience } from '@/lib/calendar/audience'

// TEAM VIEW / PUBLIC VIEW (owner ruling 2026-10-29). Real links, so the row is a server component and
// the switch is a page load. Drawn for a Space's admins only; the callers decide that.
export function CalendarAudienceToggle({ slug, audience }: { slug: string; audience: CalendarAudience }) {
  return (
    <SegmentedLinks
      label="Which calendar to look at"
      links={audienceLinks(slug)}
      activeHref={audienceHref(slug, audience)}
    />
  )
}
