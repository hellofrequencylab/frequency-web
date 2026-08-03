The in-app DetailTemplate tab row (a circle's About/Feed/Events, a profile's tabs). Underline style with an amber active marker over a hairline base rule.

```jsx
const [tab, setTab] = React.useState('feed')
<Tabs
  value={tab}
  onChange={setTab}
  tabs={[
    { value: 'feed', label: 'Feed', count: 24 },
    { value: 'events', label: 'Events', count: 3 },
    { value: 'about', label: 'About' },
  ]}
/>
```

- Controlled with `value`+`onChange`, or uncontrolled with `defaultValue`. Tabs can be plain strings.
