// PER-SPACE EMAIL KILL-SWITCH (ENTITY-SPACES-BUILD Phase 3, "per-space kill-switch"). This was a
// placeholder during the parallel build; the integrator WIRED it to the real backbone seam. The owner
// surface + actions import the kill-switch from here, so this thin re-export keeps their imports stable
// while delegating to the real implementation in @/lib/spaces/email (which gates on canEditProfile,
// requires the anti-spam acknowledgment to enable, and persists spaces.email_enabled). Both consumers
// (the email settings page Server Component + the 'use server' campaigns-actions) are server-side, so
// re-exporting the server-only seam here is safe.

export { isSpaceEmailEnabled, setSpaceEmailEnabled } from '@/lib/spaces/email'
