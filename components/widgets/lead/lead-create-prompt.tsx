import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'

// The shared "you haven't made one yet" prompt for the Leadership hub's creator areas (Journeys,
// Practices, Spaces, Events). The hub redesign makes these areas ALWAYS render (owner directive): a
// leader who has created nothing of that type sees a meaningful nudge to make their first one instead
// of the section self-hiding, so the hub reads as a complete dashboard and actively guides creation.
export function LeadCreatePrompt({
  section,
  icon,
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  section: string
  icon: LucideIcon
  title: string
  description: string
  ctaHref: string
  ctaLabel: string
}) {
  return (
    <section>
      <SectionHeader title={section} />
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={
          <Link href={ctaHref} className={buttonClasses('primary', 'sm')}>
            {ctaLabel}
          </Link>
        }
      />
    </section>
  )
}
