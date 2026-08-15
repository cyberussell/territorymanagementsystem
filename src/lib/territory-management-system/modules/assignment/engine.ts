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

// What the engine needs to know about each eligible record to group households together and keep
// each partnership's records geographically clustered — plusCode is null/'' for a record with no
// Plus Code recorded, which never merges with another blank one (see the grouping loop below).
// blockId is optional/nullable for the same reason: a record with no block assigned never merges
// with another blockless one either (see groupUnitsIntoBlockRuns).
export interface EligibleRecord {
  id: string
  plusCode: string | null
  blockId?: string | null
}

export const DEFAULT_MAX_PER_PARTNERSHIP = 6

// Multiple records sharing a non-empty Plus Code (a household with more than one contact — see
// the 12/029-era "multi-record households" feature) are folded into a single assignment "unit"
// here, in first-occurrence order, so the whole household always lands in the same partnership
// and fills exactly one of its maxPerPartnership slots — the publisher makes one visit to the
// address regardless of how many people are recorded there. A blank/null Plus Code never merges
// with another blank one; each such record is always its own singleton unit. Exported so
// addPartnershipToBatch (queries.ts) — which fills one newly-added partnership from whatever's
// still unassigned, outside a full calculateAssignment run — groups households the same way.
export function groupIntoUnits(eligibleRecords: EligibleRecord[]): string[][] {
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
  return units
}

// Chains consecutive units sharing the same non-null blockId into one "run", in the order given
// (which is already territory -> section -> block -> staleness, see fetchEligibleRecordIds) — so
// a block's households stay adjacent as a single group to hand to one partnership, instead of
// getting split wherever a flat maxPerPartnership-sized slice happens to land. A block-less unit
// (blockId null/undefined, e.g. a record added before blocks existed) never merges with another
// block-less one, same singleton rule groupIntoUnits applies to a blank Plus Code, and for the
// same reason: two records that merely both lack the field aren't known to be related.
export function groupUnitsIntoBlockRuns(units: string[][], blockIdByFirstRecordId: Map<string, string | null | undefined>): string[][][] {
  const runs: string[][][] = []
  let currentBlockId: string | null = null
  for (const unit of units) {
    const blockId = blockIdByFirstRecordId.get(unit[0]) ?? null
    if (blockId !== null && blockId === currentBlockId) {
      runs[runs.length - 1].push(unit)
    } else {
      runs.push([unit])
      currentBlockId = blockId
    }
  }
  return runs
}

// Fills one partnership's worth of units from the front of runQueue, mutating it in place, and
// returns the flat record-id list for that partnership. maxPerPartnership counts UNITS
// (households), same as the original flat-slice design — a household of 3 people still only
// fills one slot. Prefers whole runs (whole blocks) so a partnership's records stay
// geographically clustered: a run that would overflow the remaining capacity is left whole for
// the NEXT partnership rather than split, unless the partnership is still empty and the run alone
// has more units than maxPerPartnership — then it has to be split (it could never fit whole in
// any partnership), at unit/household granularity only, never mid-household. The unconsumed tail
// of a split run is pushed back to the front of runQueue so the next partnership picks up the
// same block right where this one left off. Shared by calculateAssignment (looping this once per
// partnership) and addPartnershipToBatch (queries.ts, filling exactly one newly-added partner
// from whatever's left over).
export function fillPartnershipFromRuns(runQueue: string[][][], maxPerPartnership: number): string[] {
  const takenUnits: string[][] = []
  let unitCount = 0
  while (runQueue.length > 0) {
    const run = runQueue[0]
    if (unitCount + run.length <= maxPerPartnership) {
      takenUnits.push(...run)
      unitCount += run.length
      runQueue.shift()
      continue
    }
    if (unitCount > 0) break // Doesn't fit what's left of this partnership — defer the whole run, don't split it.

    // unitCount === 0: the run alone has more units than an empty partnership's whole capacity,
    // so it must be split. Takes at least one unit even if maxPerPartnership is 0 or negative, so
    // a pathological cap can't stall progress (every run always has >=1 unit).
    const takeCount = Math.max(1, Math.min(run.length, maxPerPartnership))
    const taken = run.slice(0, takeCount)
    takenUnits.push(...taken)
    unitCount += taken.length
    const remainder = run.slice(takeCount)
    runQueue.shift()
    if (remainder.length > 0) runQueue.unshift(remainder)
    break
  }
  return takenUnits.flat()
}

// Records are always assigned in the exact order they're passed in — never shuffled or
// randomized. Partnership 1 fills first (up to maxPerPartnership), then partnership 2, and so on;
// only the last partnership may end up with fewer than the max. Within that order, whole blocks
// are kept together in one partnership wherever they fit (see fillPartnershipFromRuns) so a
// partnership's records form a geographic cluster instead of a block being split arbitrarily
// across two partners.
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

  const units = groupIntoUnits(eligibleRecords)
  const blockIdByFirstRecordId = new Map(eligibleRecords.map((r) => [r.id, r.blockId]))
  const runQueue = groupUnitsIntoBlockRuns(units, blockIdByFirstRecordId)

  // Units fill sequentially, partnership-by-partnership, up to maxPerPartnership each — so the
  // number of partnerships that can end up with at least one unit is capped at
  // ceil(units / maxPerPartnership), regardless of how many more were requested. Requesting
  // more than that used to be a hard error; now it's capped instead — a territory legitimately
  // having fewer approved records than publishers who showed up is a normal day, not a mistake
  // to correct before generating. The caller (createAssignment/queries.ts) already stores the
  // originally-requested count separately from the actual partnership rows created here, so the
  // UI can surface the gap as a note ("N publishers should do another form of ministry today")
  // instead of blocking. (Deferring whole runs rather than splitting them can leave a
  // partnership under this ideal max — that's the intended tradeoff for staying clustered, not a
  // bug — so this is a lower-bound estimate of how many partnerships the pool can fill, same as
  // it always was.)
  const maxPossiblePartnerships = Math.ceil(units.length / maxPerPartnership)
  const actualPartnershipCount = Math.min(partnershipCount, maxPossiblePartnerships)

  const partnerships: AssignmentPartnershipPlan[] = []
  let assignedRecordCount = 0
  for (let sequence = 1; sequence <= actualPartnershipCount; sequence += 1) {
    const recordIds = fillPartnershipFromRuns(runQueue, maxPerPartnership)
    partnerships.push({ sequence, recordIds })
    assignedRecordCount += recordIds.length
  }

  return { partnerships, unassignedCount: eligibleRecords.length - assignedRecordCount }
}

// Generic over T so it also narrows CreateAssignmentResult | AssignmentError in queries.ts,
// not just AssignmentPlan | AssignmentError.
export function isAssignmentError<T extends object>(result: T | AssignmentError): result is AssignmentError {
  return 'error' in result
}
