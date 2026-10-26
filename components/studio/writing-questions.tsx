export function WritingQuestions({ questions }: { questions: string[] }) {
  if (!questions.length) return null
  return <aside aria-label="Writing coach" aria-live="polite" className="my-3 rounded-card border border-border bg-surface p-3 text-body-sm text-text">
    <p className="font-semibold">Your words, with a little guidance</p>
    <ul className="mt-2 list-disc space-y-1 pl-5">{questions.map(question => <li key={question}>{question}</li>)}</ul>
  </aside>
}
