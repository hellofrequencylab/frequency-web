import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { spaceContextLinks } from '@/lib/spaces/primary-nav'
import type { SpaceProfileTab } from '@/lib/spaces/profile-tab'

/** Existing Space functions remain reachable on Home; the primary menu stays small. */
export function SpaceContextLinks({ catalog }: { catalog: SpaceProfileTab[] }) {
  const links = spaceContextLinks(catalog)
  if (!links.length) return null
  return (
    <section className="space-y-4" aria-label="More from this Space">
      <SectionHeader title="More from this Space" />
      <div className="flex flex-wrap gap-3">
        {links.map((link) => <Link key={link.href} href={link.href} className={buttonClasses('secondary', 'sm')} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined}>{link.label}</Link>)}
      </div>
    </section>
  )
}
