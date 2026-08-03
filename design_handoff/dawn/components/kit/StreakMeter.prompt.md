The streak. Anti-Duolingo by construction.

```jsx
<StreakMeter days={50} freezes={2} week={['logged','logged','frozen','logged','missed','logged','today']} hint="Never miss twice" best={64} />
```

- A missed day is a **hollow** dot. Never red, never an alarm icon, never a countdown to losing it.
- Freezes are a kindness, so they read teal (earned), not a warning.
- The count is mono and small. A 50-day streak does not need a 2rem numeral.
- Copy rules: state the fact ("Day 50") or the rule ("Never miss twice"). Never "don't lose your streak".
