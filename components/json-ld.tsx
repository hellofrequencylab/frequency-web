// Renders one or more Schema.org objects as a <script type="application/ld+json">.
// `<` is escaped so a stray "</script>" inside any string value can't break out
// of the script context (the standard JSON-LD injection guard).
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  )
}
