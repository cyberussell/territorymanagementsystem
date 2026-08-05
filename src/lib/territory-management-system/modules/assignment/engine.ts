// The Assignment Engine — deliberately pure and DB-free (no Supabase import anywhere in this
// file) so it's a single reusable, independently testable source of truth for how records get
// split across partnerships. Callers (modules/assignment/queries.ts) own fetching the eligible
// record pool in the correct order and persisting the result; this function only does the math.

export interface AssignmentPartnershipPlan {
  sequence: number
  recordIds: string[]
}

export interface AssignmentPlan {
  partnerships: AssignmentPartnershipPlan[]
  unassignedCount: number
}

export interface AssignmentError {
  error: string
}

// What the engine needs to know about each eligible record to group households together —
// plusCode is null/'' for a record with no Plus Code recorded, which never merges with another
// blank one (see the grouping loop below).
export interface EligibleRecord {
  id: string
  plusCode: string | null
}

export const DEFAULT_MAX_PER_PARTNERSHIP = 6

// Records are always assigned sequentially, in the exact order they're passed in — never
// shuffled or randomized. Partnership 1 fills first (up to maxPerPartnership), then
// partnership 2, and so on; only the last partnership may end up with fewer than the max.
export function calculateAssignment(
  eligibleRecords: EligibleRecord[],
  partnershipCount: number,
  maxPerPartnership: number = DEFAULT_MAX_PER_PARTNERSHIP
): AssignmentPlan | AssignmentError {
  if (!Number.isInteger(partnershipCount) || partnershipCount < 1) {
    return { error: 'Enter at least 1 partnership.' }
  }
  // Zero eligible records isn't an error — it's the "brand-new/unmapped territory" scenario:
  // publishers still get a real assignment (QR, partnerships, a workspace), just with nothing
  // pre-assigned to visit. They spend the day searching the area and adding new contact
  // records instead of revisiting existing ones (see PublisherWorkspaceApp's empty-records
  // messaging).
  if (eligibleRecords.length === 0) {
    return {
      partnerships: Array.from({ length: partnershipCount }, (_, i) => ({ sequence: i + 1, recordIds: [] })),
      unassignedCount: 0,
    }
  }

  // Multiple records sharing a non-empty Plus Code (a household with more than one contact —
  // see the 12/029-era "multi-record households" feature) are folded into a single assignment
  // "unit" here, in first-occurrence order, so the whole household always lands in the same
  // partnership and fills exactly one of its maxPerPartnership slots — the publisher makes one
  // visit to the address regardless of how many people are recorded there. A blank/null Plus
  // Code never merges with another blank one; each such record is always its own singleton unit.
  const units: string[][] = []
  const unitIndexByPlusCode = new Map<string, number>()
  for (const record of eligibleRecords) {
    if (record.plusCode && unitIndexByPlusCode.has(record.plusCode)) {
      units[unitIndexByPlusCode.get(record.plusCode)!].push(record.id)
      continue
    }
    if (record.plusCode) unitIndexByPlusCode.set(record.plusCode, units.length)
    units.push([record.id])
  }

  // Units fill sequentially, partnership-by-partnership, up to maxPerPartnership each — so the
  // number of partnerships that can end up with at least one unit is capped at
  // ceil(units / maxPerPartnership), regardless of how many more were requested. Requesting
  // more than that used to be a hard error; now it's capped instead — a territory legitimately
  // having fewer approved records than publishers who showed up is a normal day, not a mistake
  // to correct before generating. The caller (createAssignment/queries.ts) already stores the
  // originally-requested count separately from the actual partnership rows created here, so the
  // UI can surface the gap as a note ("N publishers should do another form of ministry today")
  // instead of blocking.
  const maxPossiblePartnerships = Math.ceil(units.length / maxPerPartnership)
  const actualPartnershipCount = Math.min(partnershipCount, maxPossiblePartnerships)

  const partnerships: AssignmentPartnershipPlan[] = []
  let unitCursor = 0
  let assignedRecordCount = 0
  for (let sequence = 1; sequence <= actualPartnershipCount; sequence += 1) {
    const unitSlice = units.slice(unitCursor, unitCursor + maxPerPartnership)
    const recordIds = unitSlice.flat()
    partnerships.push({ sequence, recordIds })
    unitCursor += unitSlice.length
    assignedRecordCount += recordIds.length
  }

  return { partnerships, unassignedCount: eligibleRecords.length - assignedRecordCount }
}

// Generic over T so it also narrows CreateAssignmentResult | AssignmentError in queries.ts,
// not just AssignmentPlan | AssignmentError.
export function isAssignmentError<T extends object>(result: T | AssignmentError): result is AssignmentError {
  return 'error' in result
}
