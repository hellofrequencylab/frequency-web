'use client'

import { useEffect, useId, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'

/** One membership prompt across the Feed preview and public event chat. The caller owns
 * the trigger and whether the preview can be dismissed; membership is never cookie consent. */
export function JoinPrompt({
  open, dialogRef, dismissible = false, onDismiss, title, children, joinHref,
  joinLabel, secondary, loginHref, footer,
}: {
  open: boolean
  dialogRef: RefObject<HTMLDialogElement | null>
  dismissible?: boolean
  onDismiss?: () => void
  title: ReactNode
  children: ReactNode
  joinHref: string
  joinLabel: string
  secondary: ReactNode
  loginHref: string
  footer: ReactNode
}) {
  const titleId = useId()
  const bodyId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open, dialogRef])

  return (
    <dialog
      ref={dialogRef}
      className="fqm-join"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => { if (!dismissible) event.preventDefault() }}
      onClose={() => {
        if (dismissible) onDismiss?.()
        else if (open) dialogRef.current?.showModal()
      }}
    >
      <div className="fqm-join-box">
        <div className="fq-aura" aria-hidden />
        <div className="fqm-join-in">
          <span className="k">Frequency Community Collective</span>
          <h2 id={titleId} className="h2 fqm-join-h">{title}</h2>
          <p id={bodyId} className="fqm-join-p">{children}</p>
          <div className="fqm-join-acts">
            <Link href={joinHref} className="btn pa lg">{joinLabel}</Link>
            {secondary}
          </div>
          <p className="fqm-join-login">
            Already a member? <Link href={loginHref}>Log in</Link>
          </p>
          {footer}
        </div>
      </div>
    </dialog>
  )
}
