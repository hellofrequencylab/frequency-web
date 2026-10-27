import { memberDesignBranchReport } from '../lib/member-design-branches.mjs'
const { scanned, failures } = memberDesignBranchReport()
for (const failure of failures) console.error(`${failure.file}:${failure.line}: executable platform design branch: ${failure.expression}`)
console.log(`Member platform-design branch check: ${scanned} route modules scanned; ${failures.length} executable branches. Display labels and shared anonymous access policy are not visual branches.`)
process.exitCode = failures.length ? 1 : 0
