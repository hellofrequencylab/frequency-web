import 'server-only'

// Pull plain text out of an uploaded course write-up (ADR-302): PDF, Word (.docx), or plain text /
// markdown. Server-only — pdf-parse and mammoth are Node libraries (kept external from the bundle,
// see next.config serverExternalPackages). Returns trimmed text, or '' when nothing readable.

export async function extractOverviewText(buf: Buffer, mime: string, filename: string): Promise<string> {
  const name = (filename || '').toLowerCase()

  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buf) })
    const res = await parser.getText()
    return (res?.text ?? '').trim()
  }

  if (
    mime.includes('officedocument.wordprocessing') ||
    mime.includes('msword') ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  ) {
    const mammoth = (await import('mammoth')).default
    const res = await mammoth.extractRawText({ buffer: buf })
    return (res?.value ?? '').trim()
  }

  // Plain text / markdown / anything else readable as UTF-8.
  return buf.toString('utf8').trim()
}
