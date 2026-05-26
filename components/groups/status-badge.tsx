type GroupStatus = 'forming' | 'active' | 'inactive' | 'archived'

const STATUS_STYLES: Record<GroupStatus, { label: string; cls: string }> = {
  forming:  { label: 'Forming',  cls: 'bg-gray-100 text-gray-500' },
  active:   { label: 'Active',   cls: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactive', cls: 'bg-amber-100 text-amber-700' },
  archived: { label: 'Archived', cls: 'bg-red-100 text-red-600' },
}

export function StatusBadge({ status }: { status: GroupStatus | string }) {
  const config = STATUS_STYLES[status as GroupStatus] ?? STATUS_STYLES.forming
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${config.cls}`}>
      {config.label}
    </span>
  )
}
