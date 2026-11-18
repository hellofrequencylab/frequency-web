// /credentials/<id>/badge.svg: a credential's shareable badge (owner 2026-11-18). Public by design: it shows
// exactly what the credential page shows (the holder's display name, the course, the year). A revoked or
// unknown credential returns 404, so a badge never outlives the credential it stands for.
import { NextResponse } from 'next/server'
import { getPublicCredential } from '@/lib/courses/credentials'
import { badgeSvg } from '@/lib/courses/badge'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await getPublicCredential(id)
  if (!c || c.revoked) return new NextResponse('Not found', { status: 404 })
  const svg = badgeSvg({ level: c.level, courseTitle: c.course.title, holder: c.holder.name, year: c.issuedAt.slice(0, 4) })
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
