'use client'

import { buttonClasses } from '@/components/ui/button'

// A submit button that asks for confirmation before submitting its form. Used to guard destructive
// server-action forms (e.g. Delete a listing) from a stray click. The parent stays a Server Component;
// only this button opts into the client so it can prompt. Voice-canon copy passed in by the caller.
export function ConfirmSubmitButton({
  confirm,
  label,
  variant = 'ghost',
  size = 'sm',
}: {
  confirm: string
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="submit"
      className={buttonClasses(variant, size)}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault()
      }}
    >
      {label}
    </button>
  )
}
