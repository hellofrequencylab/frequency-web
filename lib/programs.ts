// Programs: the Foundation's frameworks and trainings for starting, running, and
// maintaining a circle (the mission's activation content). Content lives in git as
// Markdown under content/programs/, like the help center, so it versions with the
// code and needs no migration. This is the content layer; progress-tracking +
// lifecycle gamification (start/activate/invite/attend rewards) are a later
// increment (DEVELOPMENT-MAP Stage B). Server-only (fs).

import { promises as fs } from 'fs'
import path from 'path'

const PROGRAMS_DIR = path.join(process.cwd(), 'content', 'programs')

export interface Program {
  slug: string
  title: string
  description: string
  /** Who it's for: member (anyone) or host (running a circle). */
  audience: string
  /** Freeform effort hint, e.g. "10 min read" or "A 4-week journey". */
  duration: string | null
  order: number
  body: string
}

type FrontMatter = Record<string, string>

function parseFrontMatter(raw: string): { data: FrontMatter; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const data: FrontMatter = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    data[key] = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return { data, content: match[2].trim() }
}

async function readProgram(file: string): Promise<Program> {
  const raw = await fs.readFile(path.join(PROGRAMS_DIR, file), 'utf8')
  const { data, content } = parseFrontMatter(raw)
  return {
    slug: file.replace(/\.mdx?$/, ''),
    title: data.title ?? file,
    description: data.description ?? '',
    audience: data.audience ?? 'member',
    duration: data.duration ?? null,
    order: Number(data.order ?? '99') || 99,
    body: content,
  }
}

export async function listPrograms(): Promise<Program[]> {
  let files: string[]
  try {
    files = (await fs.readdir(PROGRAMS_DIR)).filter((f) => /\.mdx?$/.test(f))
  } catch {
    return []
  }
  const programs = await Promise.all(files.map(readProgram))
  return programs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
}

export async function getProgram(slug: string): Promise<Program | null> {
  return (await listPrograms()).find((p) => p.slug === slug) ?? null
}
