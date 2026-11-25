import { redirect } from 'next/navigation'

// CRM Tasks folded into Console Work (SCAN-1346, owner ruling 2026-11-25 "Fold into Work"). Every row in
// crm_tasks was a Plan to-do, so this page listed the same to-dos as /admin/work under another name. A
// call-back made from a contact (the follow-up button) is a crm_tasks row too and lands in Work. The old
// link keeps working.

export default function CrmTasksPage() {
  redirect('/admin/work')
}
