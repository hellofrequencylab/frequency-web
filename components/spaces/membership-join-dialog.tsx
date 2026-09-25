'use client'

import { useState, type ReactNode } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { X } from 'lucide-react'

// THE MEMBERSHIP POP-UP (LIVE-510). One button, and the plans in a dialog over the page.
//
// 🔴 IT HOLDS THE PANEL, IT DOES NOT BUILD IT. `children` is the SERVER-rendered join surface
// (MembershipJoin), handed in as a prop by the block that mounts this. That is the whole reason the
// split is here rather than a client component that fetches tiers itself: prices, capacity,
// included events and the viewer's own membership stay a server read, this file stays a `useState`
// and a portal, and there is no second copy of the tier model in the browser bundle.
//
// The consequence, stated so it is not read as a bug: the panel is rendered with the page, not on
// the click, so the read happens whether or not anyone opens it. It is the SAME request-cached
// `readTiers` the Memberships tab's own gate already ran for this request (LIVE-509), so it costs
// no extra round trip, and opening is instant instead of showing a spinner over a dimmed page.
//
// `aria-labelledby` points at the panel's own visible heading rather than restating it in an
// `aria-label`, which is the rule components/ui/dialog.tsx asks callers to follow.

/** A stable id for the panel heading, so the dialog's accessible name follows the visible text. */
const HEADING_ID = 'membership-join-dialog-heading'

export function MembershipJoinDialog({
  label,
  heading,
  children,
}: {
  /** The button's own words. The operator authors it; the block supplies a plain default. */
  label: string
  /** The panel's visible heading, which is also the dialog's accessible name. */
  heading: string
  /** The server-rendered join surface. Never built here. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        ariaLabelledBy={HEADING_ID}
        className="max-w-3xl"
        align="bottom"
      >
        <div className="max-h-[90vh] overflow-y-auto rounded-t-card bg-surface p-6 sm:rounded-card sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 id={HEADING_ID} className="font-section text-page-title font-bold text-text">
              {heading}
            </h2>
            <IconButton type="button" onClick={() => setOpen(false)} label="Close" variant="plain">
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
          {children}
        </div>
      </Dialog>
    </>
  )
}
