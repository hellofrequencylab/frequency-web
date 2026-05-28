type GroupStatus = 'forming' | 'active' | 'inactive' | 'archived'

const STATUS_STYLES: Record<GroupStatus, { label: string; cls: string }> = {
  forming:  { label: 'Forming',  cls: 'bg-surface-elevated text-muted' },
  active:   { label: 'Active',   cls: 'bg-success-bg text-success' },
  inactive: { label: 'Inactive', cls: 'bg-warning-bg text-warning' },
  archived: { label: 'Archived', cls: 'bg-danger-bg text-danger' },
}

export function StatusBadge({ status }: { status: GroupStatus | string }) {
  const config = STATUS_STYLES[status as GroupStatus] ?? STATUS_STYLES.forming
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${config.cls}`}>
      {config.label}
    </span>
  )
}
