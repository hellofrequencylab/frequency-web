// The help center's search index, built once at deploy time (HYG-245).
//
// Vera's launcher searches the help articles in the browser. The (main) layout used to build this
// index from the Markdown under content/help on every member request, and pass it to the launcher
// as a prop. That put the Markdown (about 293 KB) into every server function's traced files through
// a '/**' tracing include, and about 34 KB of index into every member page's payload.
//
// Now the index is a static file, generated when the deploy builds and served from the edge. The
// launcher fetches it the first time someone opens Help. The articles are the public help center,
// so there is nothing here a signed-out visitor cannot already read at /help.

import { NextResponse } from 'next/server'
import { getSearchIndex } from '@/lib/help/content'

export const dynamic = 'force-static'

export async function GET() {
  return NextResponse.json(await getSearchIndex())
}
