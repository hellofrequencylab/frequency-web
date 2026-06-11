'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronUp, LogOut, Settings, User } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { ROLE_LABEL, roleBadgeStyle } from '@/lib/community-roles'
import type { CommunityRole } from '@/lib/core/roles'
import type { ProfileIdentity } from '@/lib/types/profile'

// The operator's identity card, pinned at the BOTTOM of the admin left rail — the
// member shell's sidebar profile card brought back for the admin workspace, styled
// for the canvas: no solid panel, just a hairline above it; rows fill on hover.
// The chevron slides the quick actions open (the card grows upward off its pinned
// bottom edge); it never opens on scroll or hover.

export function AdminProfileCard({
  profile,
  role,
}: {
  profile: ProfileIdentity
  role: CommunityRole
}) {
  const [open, setOpen] = useState(false)
  const profileHref = `/people/${profile.handle}`

  return (
    <div className="border-t border-border/70 pt-1.5">
      {/* Quick actions — revealed above the identity bar's pinned bottom edge. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 px-1 pt-2">
            <Link
              href={profileHref}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
            >
              <User className="h-4 w-4 shrink-0 text-muted" />
              View profile
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
            >
              <Settings className="h-4 w-4 shrink-0 text-muted" />
              Settings
            </Link>
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-bg"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Identity bar. */}
      <div className="flex items-center gap-2.5 px-2 py-3">
        <Link href={profileHref} className="shrink-0">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.display_name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 select-none items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
              {getInitials(profile.display_name)}
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={profileHref}>
            <p className="truncate text-sm font-semibold leading-tight text-text">
              {profile.display_name}
            </p>
          </Link>
          <span className="rank-badge mt-1 inline-block text-2xs leading-tight" style={roleBadgeStyle(role)}>
            {ROLE_LABEL[role]}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse profile menu' : 'Expand profile menu'}
          className="shrink-0 rounded-md p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-primary-strong"
        >
          <ChevronUp className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  )
}
