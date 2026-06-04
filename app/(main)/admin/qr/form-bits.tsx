// Small presentational + date helpers shared by the QR Studio's managers
// (check-in codes + dynamic links), so the field/badge styling stays identical.

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-subtle mb-1">{label}</span>
      {children}
    </label>
  )
}

const TONES: Record<string, string> = {
  neutral: 'bg-surface-elevated text-muted',
  signal: 'bg-signal-bg text-signal-strong',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  primary: 'bg-primary-bg text-primary-strong',
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'signal' | 'warning' | 'danger' | 'primary'
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** ISO (UTC) → value for <input type="datetime-local"> in the viewer's local tz. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local value (local tz) → ISO (UTC), or null when cleared. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
