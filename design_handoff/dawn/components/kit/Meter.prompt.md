An allowance against a cap. Never a lock.

```jsx
<Meter label="Contacts" used={148} cap={200} />
<Meter label="Emails" used={287} cap={300} period="this month" />
<Meter label="Published Journeys" used={1} cap={1} />
<Meter label="Contacts" used={4210} hint="Unlimited on Business." />
```

- Teal under 80%, amber warning at 80%, danger only at the cap. A cap is a fact, not a failure.
- Copy at the cap says what happens next ("new ones wait"), never "upgrade now". The nudge is the fee-buydown maths, shown separately.
- Omit `cap` for unlimited: the track renders open and striped rather than 100% full.
