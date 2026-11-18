// The STRUCTURE pass for a Journey lesson body (remark plugin, pure: no I/O, no React).
//
// A lesson body is Markdown an author types in the builder. Authors write the way people write: a
// sentence that ends in a colon and then a list, a run of "Presence: ..." lines, an agenda of
// "Presence, 3 minutes. ..." beats, a page of prompts to fill in. Plain Markdown flattens all four
// into the same bulleted list. This pass reads the shapes an author already uses and names them,
// so the lesson renderer (components/journey/v2/learn/lesson-prose.tsx) can draw each as what it
// is. It adds class names and wrappers only: no word is added, dropped or reordered, except the
// trailing colon of a line that becomes a heading or a prompt label.
//
//   a short first paragraph              mc-lede     the opening, set larger
//   "Staying steady. Overwhelm ..."      mc-runin    a two-word opener over a long paragraph reads as its heading
//   "…:" paragraph, then a list          mc-leadin   kept tight to its list
//   short "…:" paragraph, then a list    mc-group    a titled card (the colon is dropped)
//   every item "Label: text"             mc-terms    the label is set strong
//   every item "Label, 3 minutes. text"  mc-beats    a timed run of show
//   every item ends with ":"             mc-fill     prompts to fill in (the colon is dropped)

interface MdNode {
  type: string
  value?: string
  ordered?: boolean | null
  children?: MdNode[]
  data?: { hName?: string; hProperties?: { className?: string[] } }
}

/** A lead-in this short reads as a title for its list, not as a sentence before it. */
const GROUP_TITLE_MAX = 44
/** The opening is set larger only while it is an opening: a long first paragraph stays body text. */
const LEDE_MAX = 180
/** A paragraph that opens with a one to three word sentence and then runs long: the opener names it. */
const RUNIN = /^([A-Z][A-Za-z'’]*(?: [A-Za-z'’]+){0,2})\.\s+(?=\S)/
const RUNIN_BODY_MIN = 120
/** "Label: text". The label is short and has no sentence end inside it. */
const TERM = /^([^:.!?\n]{2,40}):\s+(?=\S)/
/** "Label, 3 minutes. text". */
const BEAT = /^([^,:.!?\n]{2,28}),\s+((?:about\s+)?\d+\s+(?:minutes?|mins?|hours?))\.\s+(?=\S)/i

function textOf(n: MdNode): string {
  if (typeof n.value === 'string') return n.value
  return (n.children ?? []).map(textOf).join('')
}

function addClass(n: MdNode, name: string) {
  const data = (n.data ??= {})
  const props = (data.hProperties ??= {})
  ;(props.className ??= []).push(name)
}

/** The last text leaf under a node, so a trailing colon can be dropped where it sits. */
function lastText(n: MdNode): MdNode | null {
  if (n.type === 'text') return n
  const kids = n.children ?? []
  for (let i = kids.length - 1; i >= 0; i--) {
    const t = lastText(kids[i])
    if (t) return t
  }
  return null
}

function dropTrailingColon(n: MdNode) {
  const t = lastText(n)
  if (t?.value) t.value = t.value.replace(/:\s*$/, '')
}

const wrap = (hName: string, className: string, children: MdNode[]): MdNode => ({
  type: 'lessonWrap',
  children,
  data: { hName, hProperties: { className: [className] } },
})

/** The first text leaf of a list item, when the item opens with plain text. */
function openingText(item: MdNode): { para: MdNode; text: MdNode } | null {
  const para = item.children?.[0]
  const text = para?.type === 'paragraph' ? para.children?.[0] : undefined
  return para && text?.type === 'text' && typeof text.value === 'string' ? { para, text } : null
}

function shapeList(list: MdNode) {
  const items = (list.children ?? []).filter((c) => c.type === 'listItem')
  if (items.length < 2 || list.ordered) return

  // Prompts to fill in: every item is one line that ends in a colon.
  if (items.every((it) => (it.children ?? []).length === 1 && /:\s*$/.test(textOf(it)))) {
    addClass(list, 'mc-fill')
    items.forEach(dropTrailingColon)
    return
  }

  const opens = items.map(openingText)
  if (opens.some((o) => !o)) return

  // A timed run of show: "Presence, 3 minutes. Phone face down."
  if (opens.every((o) => BEAT.test(o!.text.value!))) {
    addClass(list, 'mc-beats')
    for (const o of opens) {
      const m = BEAT.exec(o!.text.value!)!
      const rest: MdNode[] = [{ type: 'text', value: o!.text.value!.slice(m[0].length) }, ...o!.para.children!.slice(1)]
      o!.para.children = [
        { type: 'strong', children: [{ type: 'text', value: m[1] }] },
        wrap('span', 'mc-time', [{ type: 'text', value: m[2] }]),
        wrap('span', 'mc-beat-body', rest),
      ]
    }
    return
  }

  // Named lines: "Presence: the idea, and a story that carries it."
  if (opens.every((o) => TERM.test(o!.text.value!))) {
    addClass(list, 'mc-terms')
    for (const o of opens) {
      const m = TERM.exec(o!.text.value!)!
      o!.para.children = [
        { type: 'strong', children: [{ type: 'text', value: `${m[1]}:` }] },
        { type: 'text', value: ` ${o!.text.value!.slice(m[0].length)}` },
        ...o!.para.children!.slice(1),
      ]
    }
  }
}

/** remark plugin: name the shapes in a lesson body. See the table at the top of this file. */
export function lessonStructure() {
  return (tree: MdNode) => {
    const kids = tree.children ?? []
    const first = kids[0]
    if (first?.type === 'paragraph' && kids.length > 1 && textOf(first).length <= LEDE_MAX) addClass(first, 'mc-lede')
    for (const n of kids) {
      const t = n.type === 'paragraph' && n !== first ? n.children?.[0] : undefined
      const m = t?.type === 'text' && t.value ? RUNIN.exec(t.value) : null
      if (!m || textOf(n).length - m[0].length < RUNIN_BODY_MIN) continue
      n.children = [wrap('strong', 'mc-runin', [{ type: 'text', value: m[1] }]), { type: 'text', value: t!.value!.slice(m[0].length) }, ...n.children!.slice(1)]
    }

    const out: MdNode[] = []
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i]
      const next = kids[i + 1]
      if (n.type === 'list') shapeList(n)
      if (n.type === 'paragraph' && next?.type === 'list' && /:\s*$/.test(textOf(n))) {
        shapeList(next)
        if (n !== first && textOf(n).trim().length <= GROUP_TITLE_MAX) {
          dropTrailingColon(n)
          addClass(n, 'mc-group-k')
          out.push(wrap('section', 'mc-group', [n, next]))
        } else {
          addClass(n, 'mc-leadin')
          out.push(n, next)
        }
        i++
        continue
      }
      out.push(n)
    }
    tree.children = out
  }
}

/** A lesson or week title an author wrote as "Kind · Name" ("Overview · Slow is smooth"), split so a
 *  surface can set the kind as a label and the name as the heading. No separator: all name. */
export function splitTitle(title: string): { kind: string | null; name: string } {
  const at = title.indexOf(' · ')
  if (at < 1 || at > 24) return { kind: null, name: title }
  const name = title.slice(at + 3).trim()
  return name ? { kind: title.slice(0, at).trim(), name } : { kind: null, name: title }
}

/** A week's focus copy as label and value pairs: "The one idea: Small and steady." reads as a fact,
 *  not a sentence. A paragraph with no short label comes back with a null label. */
export function focusFacts(body: string): { label: string | null; value: string }[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^([^:.!?]{2,32}):\s+(\S.*)$/.exec(p)
      return m ? { label: m[1], value: m[2].charAt(0).toUpperCase() + m[2].slice(1) } : { label: null, value: p }
    })
}

/** "Week 2 · Attention", or "Week 2" when the title only repeats the label. A title that already
 *  leads with its label ("Week 1 · The Engine") is used as written, never doubled. */
export function phaseHeading(title: string | null | undefined, index: number, unit: 'week' | 'month'): string {
  const label = `${unit === 'month' ? 'Month' : 'Week'} ${index + 1}`
  const own = title?.trim()
  if (!own || own.toLowerCase() === label.toLowerCase()) return label
  if (own.toLowerCase().startsWith(label.toLowerCase()) && /^[\s·:,.-]/.test(own.slice(label.length))) return own
  return `${label} · ${own}`
}
