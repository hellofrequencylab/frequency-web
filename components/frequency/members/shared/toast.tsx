'use client'

// The page-body toast is the shell's toast (README §5: one fixed pill, bottom-centre, 2.8s). Bodies
// used to mount a second .ap-toast of their own on a second event name, so a page could stack two
// pills; the shell's host (shell/toast-host.tsx) is now the only one that draws.

export { fqToast } from '../shell/toast'

/** Kept for existing callers: the shell's host already draws every toast, so this renders nothing. */
export function FqToaster(): null {
  return null
}
