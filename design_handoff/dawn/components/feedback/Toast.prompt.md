A transient achievement / status notice — Quest awards, "saved", "you earned 5 zaps". Soft elevated surface with an amber accent rail and a slide-up entrance.

```jsx
<Toast icon={<Zap size={18} />} title="You earned 5 zaps" tone="primary" onClose={dismiss}>
  Checked in at Sunrise Plunge — that counts as a practice this week.
</Toast>
```

- Tones: `primary` (amber, default) · `success` (teal) · `broadcast` (azure) · `danger`.
- Keep copy "felt, not stated" — name the real thing that happened.
