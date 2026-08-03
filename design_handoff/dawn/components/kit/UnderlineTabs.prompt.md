The one tab vocabulary (brief 05 §4). Never build pill tabs.

```jsx
<UnderlineTabs
  tabs={['Stream', { id: 'members', label: 'Members', count: 34 }, 'Events']}
  value={tab}
  onChange={setTab}
/>
```

- Used for a Detail page's sections and for any in-page switch. The underline is amber and sits on the section hairline.
- Counts use the mono face and tint amber when their tab is active.
