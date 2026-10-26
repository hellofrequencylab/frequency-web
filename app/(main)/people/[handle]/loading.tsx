import { FqSpaceLoading } from '@/components/frequency/members/space/space-loading'

// Route-level loading UI for a member PROFILE (PAGE-FRAMEWORK §5).
//
// This file exists because `/people` itself is now only a redirect into the Network hub
// (ADR-172), so the segment's own `loading.tsx` — a directory GRID of person cards — was the
// nearest one Next.js found for `/people/<handle>` too. Opening a profile flashed a six-card
// directory skeleton and then reflowed into a Detail page: the wrong shape, and a layout shift
// on every profile open. A detail route gets a detail-shaped skeleton.
//
// Mirrors the destination in `page.tsx`: a PageHero cover band (identity variant, whose default
// tier is `standard` = min-h-[15rem] sm:min-h-[20rem] in lib/layout/header-sizes.ts), the compact
// stats/bio band under it, then DetailTemplate's 2/3 content + 1/3 info-column body.
export default function PersonDetailLoading() {
  return <FqSpaceLoading label="Loading profile" />
}
