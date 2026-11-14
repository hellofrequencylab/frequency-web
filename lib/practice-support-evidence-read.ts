// Server configuration selector. Default-off keeps reads compatible with the pre-snapshot schema.
import { envFlag } from './env/string.ts'

const LEGACY_COLUMNS = 'id, logged_for, pillar_id, secondary_pillar_id, primary_pct, practice:practices(domain_id, secondary_domain_id, primary_pct)'

/** Enable only after the reviewed snapshot migration and exact app/database acceptance. */
export function practiceSupportLogColumns(): string {
  return envFlag('PRACTICE_SUPPORT_EVIDENCE_ENABLED')
    ? `${LEGACY_COLUMNS}, support_pillar_ids, support_evidence_version`
    : LEGACY_COLUMNS
}
