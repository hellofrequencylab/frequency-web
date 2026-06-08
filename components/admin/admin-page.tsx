// AdminPage is now the first-class AdminTemplate — admin pages live inside the page
// template kit and compose the SAME shared <PageHeading> grammar as every other page
// (PAGE-FRAMEWORK §3 + §8.1). This module is a back-compat alias so the existing
// `import { AdminPage, AdminSection } from '@/components/admin/admin-page'` keeps working;
// new code can import { AdminTemplate, AdminSection } from '@/components/templates'.

export { AdminTemplate as AdminPage, AdminSection } from '@/components/templates/admin-template'
