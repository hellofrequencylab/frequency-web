import type { ReactNode } from 'react'
import { PageHeading } from './page-heading'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'

/** One compact browse-page introduction. Entity cover bands and focus/dashboards stay separate. */
export function IndexHeader({ title, description, eyebrow, action, back, trail, secondary, toolbar, adminBar = true }: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
  back?: { href: string; label: string }
  trail?: { href: string; label: string }[]
  secondary?: ReactNode
  toolbar?: ReactNode
  adminBar?: boolean
}) {
  return <div className="fq-index-header">
    {trail && <Breadcrumbs trail={trail} />}
    <PageHeading title={title} description={description} eyebrow={eyebrow} actions={action} back={back} adminBar={adminBar} />
    {secondary && <div className="fq-index-secondary">{secondary}</div>}
    {toolbar && <div className="fq-index-toolbar">{toolbar}</div>}
  </div>
}
