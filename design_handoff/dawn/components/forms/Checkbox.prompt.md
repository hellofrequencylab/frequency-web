A custom warm checkbox — amber fill + check when on. Used for the beta "Oath" gate, settings, and filters.

```jsx
const [agreed, setAgreed] = React.useState(false)
<Checkbox checked={agreed} onChange={setAgreed} label="I agree to be a Frequency Web Founder." />
```

- Controlled: `checked` + `onChange(next)`. The label can be rich content.
