// The member kit's toast (shell.js `window.fqToast`): one pill, bottom centre, 2.8s. Any client code
// raises it with `fqToast('Saved.')`; the shell's host (toast-host.tsx) is the only thing that draws it.

export const FQ_TOAST_EVENT = 'fq-toast'

/** Show a confirmation pill. A no-op on the server. */
export function fqToast(message: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<string>(FQ_TOAST_EVENT, { detail: message }))
}
