/** Provider record values are retained verbatim; no regional DNS templates. */
export type EmailDnsRecord = { name: string; type: string; value: string; priority?: number; status?: string; record?: string }
export function emailDomainDnsInstructions(domain: string, records: EmailDnsRecord[], receiving: boolean) {
  const normalized = domain.toLowerCase()
  const instructions = records.map((record) => {
    const name = record.name === '@' ? normalized : (record.name === normalized || record.name.endsWith(`.${normalized}`)) ? record.name : `${record.name}.${normalized}`
    return { ...record, name }
  })
  // Inbound MX belongs on a dedicated domain; existing apex mailbox routing must survive.
  const receivingOnApex = receiving && !normalized.startsWith('reply.')
  return { domain: normalized, records: instructions, automaticDnsAvailable: false as const,
    receivingAllowed: !receivingOnApex,
    warning: receivingOnApex ? 'Use a reply subdomain for receiving. Keep existing mailbox MX records.' : null,
    sendingReady: records.filter((r) => r.record !== 'Receiving').length > 0 &&
      records.filter((r) => r.record !== 'Receiving').every((r) => r.status === 'verified'),
    receivingReady: receiving && !receivingOnApex && records.some((r) => r.record === 'Receiving') &&
      records.filter((r) => r.record === 'Receiving').every((r) => r.status === 'verified'),
  }
}
