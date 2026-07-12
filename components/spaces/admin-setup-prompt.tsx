import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'

// OPERATOR "set this up" prompt for an unconfigured CTA surface (booking / memberships / giving /
// enrollment / tickets / sessions). A member sees the normal member empty state; only an owner / admin /
// editor (viewerManagesSpace, lib/spaces/operator.ts) sees this, so the reported dead end ("Book Now"
// opening an empty surface with no owner guidance) becomes a guided next step. It composes the shared
// EmptyState + real Button-styled links straight to the exact config surface, and always offers the
// second "change what your button opens" link to the Focus config, so an owner whose button leads with
// the wrong surface (a massage business on a membership Focus) can redirect it in one click.
//
// COPY: plain camp-counselor voice, names the situation, no narrated feelings, no em/en dashes
// (CONTENT-VOICE §10). Tokens only, no hex (the links reuse the shared button token scale).

export interface SetupPromptLink {
  /** The exact config surface this action opens (an in-app path). */
  href: string
  /** A plain-verb label (sentence case, no hype). */
  label: string
  /** `primary` = the filled "set this up" action (default); `secondary` = the quieter alternate. */
  tone?: 'primary' | 'secondary'
}

export function AdminSetupPrompt({
  icon,
  title,
  description,
  links,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  links: readonly SetupPromptLink[]
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {links.map((link) => (
            <Link
              key={`${link.href}:${link.label}`}
              href={link.href}
              className={buttonClasses(link.tone === 'secondary' ? 'secondary' : 'primary', 'md')}
            >
              {link.label}
            </Link>
          ))}
        </div>
      }
    />
  )
}
