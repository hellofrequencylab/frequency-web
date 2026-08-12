import { WizardModal } from '@/components/studio/wizard-modal'
import NewCirclePage from '@/app/(main)/circles/new/page'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// /circles/new, PRESENTED AS A MODAL (ADR-1010). Read this one; its five siblings are the same
// three lines with a different wizard.
//
// The `(.)` matcher intercepts a route at the SAME segment level as this slot. `@wizard` is a slot
// and `(main)` is a route group, so neither is a URL segment and this folder sits at the root
// level, which is where `circles` sits too
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/intercepting-routes.md:
// "The `(..)` convention is based on route segments, not the file-system … it does not consider
// `@slot` folders").
//
// 🔴 THE POINT: THIS FILE RENDERS THE OTHER PAGE. Not a copy of it, not a client twin of it — the
// exact module `/circles/new` serves, imported and wrapped. So the gate, the redirect, the
// capability check, the Spark, and the autosave scope are one implementation with one behaviour,
// and the two presentations cannot drift because there is nothing to drift from. A shared link or a
// refresh never reaches this file at all (interception is a client-navigation mechanism; a cold hit
// renders `default.tsx` in this slot and the real page in `children`), which is the ADR-986 half.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export default function CircleSparkModal() {
  return (
    <WizardModal eyebrow="Studio · Circle" ariaLabel="Start a circle">
      <NewCirclePage />
    </WizardModal>
  )
}
