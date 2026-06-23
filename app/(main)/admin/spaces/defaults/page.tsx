import Link from 'next/link'
import { SlidersHorizontal, ArrowLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { provisionableTypes } from '@/lib/spaces/blueprints'
import { functionsForType, isSpaceType, DEFAULT_FUNCTION_ROLE } from '@/lib/spaces/functions'
import { listSpaceFunctionTypeDefaults } from '@/lib/spaces/type-defaults'
import {
  TypeDefaultsGrid,
  type TypeDefaultBlock,
} from '@/components/admin/spaces/type-defaults-grid'

export const dynamic = 'force-dynamic'

// OPERATOR per-TYPE function-defaults editor (per-space-roles Phase 2, docs/SPACES.md "Functions &
// access"). Janitor-gated. A grid per provisionable space type: every function that type offers, with an
// ON/OFF for new spaces and the lowest role that can use it. These set what a NEW Space of the type
// starts with (lib/spaces/provision.ts seeds entitlements + feature_roles from the operator defaults
// merged over the code defaults). FAIL-SAFE: the read is fail-safe to the code defaults, so an empty
// table renders every type at its code defaults and new spaces stand up exactly as today.
//
// The grid seeds each cell from the operator default (if any) merged over the CODE default; the
// janitor-gated actions store a row only when it differs from the code default (sparse). Per-SPACE
// overrides still beat these per-type seeds (the operator grid on /admin/spaces/[id]), and the absolute
// per-Space operator switch beats the plan; this surface is only about NEW-space starting state.

export const metadata = {
  title: 'Space defaults',
}

export default async function SpaceTypeDefaultsPage() {
  await requireAdmin('janitor')

  // FAIL-SAFE read of the operator-set defaults (normalized + validated to the registry). An empty list
  // (the common case / pre-migration) means every cell resolves to its code default.
  const defaults = await listSpaceFunctionTypeDefaults()

  // Build one block per provisionable type (the member-facing types the create wizard offers; the root
  // host is excluded). Each row's current state = the operator default merged over the code default.
  // Only valid SpaceTypes are blocked (provisionableTypes returns blueprint keys, all valid; isSpaceType
  // keeps functionsForType typed without an `as` cast and fails closed on any unexpected value).
  const types = provisionableTypes().filter((t) => isSpaceType(t.value))
  const blocks: TypeDefaultBlock[] = types.map(({ value, label }) => ({
    type: value,
    typeLabel: label,
    rows: functionsForType(isSpaceType(value) ? value : null).map((fn) => {
      const override = defaults.find((d) => d.type === value && d.fn === fn.key)
      return {
        key: fn.key,
        label: fn.label,
        description: fn.description,
        planGated: fn.entitlement !== null,
        // A universal function is on by default; an operator default can turn it off. (Plan-gated tools
        // are never seeded on, but the toggle still records intent / the code default for the pill.)
        enabled: override?.enabled ?? true,
        minRole: override?.minRole ?? DEFAULT_FUNCTION_ROLE[fn.key],
        defaultEnabled: true,
        defaultMinRole: DEFAULT_FUNCTION_ROLE[fn.key],
      }
    }),
  }))

  return (
    <AdminTemplate
      title="Space defaults"
      icon={SlidersHorizontal}
      eyebrow="Operations · Tenancy"
      description="Set what every new space of each type starts with: which tools are on and the lowest role that can use each one. A space owner can change these later, and a per-space operator switch beats the plan."
      width="wide"
    >
      <AdminSection>
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/spaces">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Spaces
          </Link>
        </Button>
      </AdminSection>

      <AdminSection
        title="Defaults by type"
        description="Changes save instantly and apply to spaces created from here on. Existing spaces keep their current settings."
      >
        <TypeDefaultsGrid blocks={blocks} />
      </AdminSection>
    </AdminTemplate>
  )
}
