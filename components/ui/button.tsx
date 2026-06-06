import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Shared button primitive — the audit found ~40 files hand-rolling button class
// strings with drifting padding / size / feedback. One scale here (variant ×
// size); `className` still merges for genuine one-offs (e.g. `w-full`, a shadow).

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-elevated',
  ghost: 'text-muted hover:bg-surface-elevated hover:text-text',
  danger: 'bg-danger text-white hover:opacity-90',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ variant = 'primary', size = 'md', className, ...props }, ref) {
  return <button ref={ref} className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...props} />
})
