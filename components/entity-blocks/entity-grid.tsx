import type { ReactNode } from 'react'
import type { TemplateId } from '@/lib/widgets/templates'

// The presentational interior GRID for the unified entity-block renderers (ADR-508, U2b). Mirrors the
// module-engine TemplateGrid (components/widgets/page-modules.tsx) so a member (Spotlight) or space
// (Spaces) grid layout lays its slots out identically. Each slot is its OWN container context
// (`@container`, Tailwind v4) so a block sizes to where it lands (wide in `main`, compact in `side`) via
// container-query variants, and columns collapse to one on small screens. Presentational + server-safe
// (no hooks / no 'use client'), so a Server Component renderer drops it in directly. Fail-safe by
// construction: an empty slot renders nothing.

export function EntityGrid({
  template,
  slot,
}: {
  template: TemplateId
  /** Render the blocks for a slot id (returns null / empty for an empty slot). */
  slot: (id: string) => ReactNode
}) {
  switch (template) {
    case 'main-side':
      return (
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
          <div className="@container space-y-6 lg:col-span-3">{slot('main')}</div>
          <div className="@container order-first space-y-6 lg:order-none lg:col-span-2">{slot('side')}</div>
        </div>
      )
    case 'two-col':
      return (
        <div className="space-y-6">
          <div className="@container space-y-6">{slot('top')}</div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="@container space-y-6">{slot('col-1')}</div>
            <div className="@container space-y-6">{slot('col-2')}</div>
          </div>
        </div>
      )
    case 'three-col':
      return (
        <div className="space-y-6">
          <div className="@container space-y-6">{slot('top')}</div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="@container space-y-6">{slot('col-1')}</div>
            <div className="@container space-y-6">{slot('col-2')}</div>
            <div className="@container space-y-6">{slot('col-3')}</div>
          </div>
        </div>
      )
    case 'header-side':
      return (
        <div className="space-y-6">
          <div className="@container space-y-6">{slot('header')}</div>
          <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="@container space-y-6 lg:col-span-3">{slot('main')}</div>
            <div className="@container space-y-6 lg:col-span-2">{slot('side')}</div>
          </div>
        </div>
      )
    case 'header-two-col':
      return (
        <div className="space-y-6">
          <div className="@container space-y-6">{slot('header')}</div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="@container space-y-6">{slot('col-1')}</div>
            <div className="@container space-y-6">{slot('col-2')}</div>
          </div>
        </div>
      )
    case 'header-main-side-footer':
      return (
        <div className="space-y-6">
          <div className="@container space-y-6">{slot('header')}</div>
          <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="@container space-y-6 lg:col-span-3">{slot('main')}</div>
            <div className="@container space-y-6 lg:col-span-2">{slot('side')}</div>
          </div>
          <div className="@container space-y-6">{slot('footer')}</div>
        </div>
      )
    default:
      return <div className="@container space-y-6">{slot('main')}</div>
  }
}
