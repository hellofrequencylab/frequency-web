A single-line text field — hairline warm border, calm neutral focus ring (text fields never glow amber), optional label, leading icon, and hint.

```jsx
<Input label="Your name" placeholder="Maya Ortiz" />
<Input label="Email" type="email" icon={<Mail size={16} />} hint="We send a magic link — no password." />
<Input label="Handle" invalid hint="That handle is taken." defaultValue="maya" />
```

- Passes through all native `<input>` props. Set `invalid` for the danger state.
