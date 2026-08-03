The one way a number appears to a member.

```jsx
<Counter kind="streak" value={50} size="sm" shape="chip" />
<Counter kind="zaps" value="2,095" caption="Zaps" shape="tile" size="md" />
<CounterRow items={[{ kind: 'zaps', value: '2,095', caption: 'Zaps' }, { kind: 'gems', value: 169, caption: 'Gems' }, { kind: 'streak', value: 50, caption: 'Streak' }]} />
```

- Values are mono, weight 500, tabular. They stay small: a count is a fact, not a headline. `lg` is for a season recap, never for chrome.
- Tone comes from the kind: Zaps and streaks amber, Gems and trophies teal, Airtime and movement the Move blue.
- `muted` for a zero or a frozen streak. Never colour a zero red.
- Max four in a row, and on a primary member page those four are Zaps, Gems, Streak and season rank. Anything with a delta is StatCard.
