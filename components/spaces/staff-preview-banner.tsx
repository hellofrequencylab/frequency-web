import { Eye } from 'lucide-react'

// STAFF PREVIEW BANNER (entity-spaces, owner back-end). Shown at the top of an owner surface when a
// platform staffer (a janitor / Executive Admin) is VIEWING a Space they do not manage. It makes the
// read-only mode unmistakable: the forms on the surface are disabled, and every write action is
// gated on canEditProfile server-side, so a staff viewer can read the owner back-end but never write
// through it. Copy passes CONTENT-VOICE: plain, no narrated feelings, no em/en dashes.

export function StaffPreviewBanner({ spaceName }: { spaceName: string }) {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg px-4 py-3"
    >
      <Eye className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-text">Staff preview</p>
        <p className="mt-0.5 text-muted">
          You are viewing {spaceName}&rsquo;s owner settings as platform staff. Changes are disabled
          here.
        </p>
      </div>
    </div>
  )
}
