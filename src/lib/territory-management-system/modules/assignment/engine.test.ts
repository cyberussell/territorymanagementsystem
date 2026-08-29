import { describe, it, expect } from 'vitest'
import { calculateAssignment, isAssignmentError, type EligibleRecord } from './engine'

// Most existing coverage predates Plus Code grouping and doesn't care about it — this wraps
// plain ids into records with no Plus Code (each its own singleton unit), so those cases behave
// exactly as before.
function noPlusCode(ids: string[]): EligibleRecord[] {
  return ids.map((id) => ({ id, plusCode: null }))
}

describe('calculateAssignment', () => {
  it('rejects a non-integer or zero partnership count', () => {
    expect(isAssignmentError(calculateAssignment(noPlusCode(['a', 'b']), 0))).toBe(true)
    expect(isAssignmentError(calculateAssignment(noPlusCode(['a', 'b']), 1.5))).toBe(true)
    expect(isAssignmentError(calculateAssignment(noPlusCode(['a', 'b']), -1))).toBe(true)
  })

  it('caps at 1 partnership when far fewer records exist than requested partnerships', () => {
    const result = calculateAssignment(noPlusCode(['a', 'b']), 3)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships).toEqual([{ sequence: 1, recordIds: ['a', 'b'] }])
    expect(result.unassignedCount).toBe(0)
  })

  it('fills partnerships sequentially, in input order, up to the max per partnership, leaving excess records unassigned for another day', () => {
    const records = noPlusCode(Array.from({ length: 10 }, (_, i) => `r${i}`))
    const result = calculateAssignment(records, 2, 4)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships).toEqual([
      { sequence: 1, recordIds: ['r0', 'r1', 'r2', 'r3'] },
      { sequence: 2, recordIds: ['r4', 'r5', 'r6', 'r7'] },
    ])
    expect(result.unassignedCount).toBe(2)
  })

  it('caps the partnership count instead of leaving some with zero records', () => {
    // 9 records can fully cover at most ceil(9/6)=2 partnerships at the default 6-record cap —
    // requesting 3 no longer errors; it's capped at 2 instead, with the caller (queries.ts)
    // surfacing the requested-vs-actual gap as a note rather than blocking generation.
    const records = noPlusCode(Array.from({ length: 9 }, (_, i) => `r${i}`))
    const result = calculateAssignment(records, 3)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships).toHaveLength(2)
    expect(result.partnerships[0].recordIds).toHaveLength(6)
    expect(result.partnerships[1].recordIds).toHaveLength(3)
    expect(result.unassignedCount).toBe(0)
  })

  it('allows a partnership count exactly at the record-supported ceiling', () => {
    const records = noPlusCode(Array.from({ length: 9 }, (_, i) => `r${i}`))
    const result = calculateAssignment(records, 2)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships[0].recordIds).toHaveLength(6)
    expect(result.partnerships[1].recordIds).toHaveLength(3)
    expect(result.unassignedCount).toBe(0)
  })

  // Regression coverage for the two worked examples given when this rule was originally designed.
  it('matches the 50-records/20-publishers/group-of-2 example: 10 partnerships requested, capped at the 9 supportable', () => {
    const records = noPlusCode(Array.from({ length: 50 }, (_, i) => `r${i}`))
    const result = calculateAssignment(records, 10)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships).toHaveLength(9)
    expect(result.unassignedCount).toBe(0) // 9 partnerships x 6 = 54 capacity, all 50 records fit
  })

  it('matches the 50-records/10-publishers/group-of-2 example: 5 partnerships requested, well within the 9 supportable', () => {
    const records = noPlusCode(Array.from({ length: 50 }, (_, i) => `r${i}`))
    const result = calculateAssignment(records, 5)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships).toHaveLength(5)
    expect(result.unassignedCount).toBe(20) // 5 partnerships x 6 = 30 assigned, 20 left for another day
  })

  it('fills each partnership to the max before moving to the next, giving the last one the remainder', () => {
    const records = noPlusCode(['a', 'b', 'c'])
    const result = calculateAssignment(records, 2, 2)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships[0].recordIds).toEqual(['a', 'b'])
    expect(result.partnerships[1].recordIds).toEqual(['c'])
    expect(result.unassignedCount).toBe(0)
  })

  // Regression coverage: zero eligible records used to hard-error ("No approved records are
  // available"), which blocked a Group Leader from ever generating an assignment for a
  // brand-new/unmapped territory. It must now succeed with every partnership getting an empty
  // record list instead.
  it('creates empty-record partnerships for a territory with zero eligible records, instead of erroring', () => {
    const result = calculateAssignment([], 3)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships).toEqual([
      { sequence: 1, recordIds: [] },
      { sequence: 2, recordIds: [] },
      { sequence: 3, recordIds: [] },
    ])
    expect(result.unassignedCount).toBe(0)
  })

  it('still requires a valid partnership count even with zero records', () => {
    expect(isAssignmentError(calculateAssignment([], 0))).toBe(true)
  })

  // Household (Plus Code) grouping — a household with multiple contact records must always
  // land in the same partnership and fill exactly one of its maxPerPartnership slots.
  describe('household (Plus Code) grouping', () => {
    it('keeps a household together in one partnership and counts it as a single slot', () => {
      const records: EligibleRecord[] = [
        { id: 'a', plusCode: 'AAAA' },
        { id: 'b', plusCode: 'AAAA' },
        { id: 'c', plusCode: null },
      ]
      const result = calculateAssignment(records, 1, 2)
      expect(isAssignmentError(result)).toBe(false)
      if (isAssignmentError(result)) return
      // maxPerPartnership=2 units: the 2-person household fills slot 1, 'c' fills slot 2 — even
      // though that's 3 raw records, not 4.
      expect(result.partnerships).toEqual([{ sequence: 1, recordIds: ['a', 'b', 'c'] }])
      expect(result.unassignedCount).toBe(0)
    })

    it('never splits a household across two partnerships even when it straddles a chunk boundary', () => {
      const records: EligibleRecord[] = [
        { id: 'a', plusCode: null },
        { id: 'b', plusCode: null },
        { id: 'c', plusCode: 'HH' },
        { id: 'd', plusCode: 'HH' },
      ]
      // maxPerPartnership=2 units: without grouping, a naive flat slice at position 2 would
      // split 'c' into partnership 1 and 'd' into partnership 2.
      const result = calculateAssignment(records, 2, 2)
      expect(isAssignmentError(result)).toBe(false)
      if (isAssignmentError(result)) return
      expect(result.partnerships[0].recordIds).toEqual(['a', 'b'])
      expect(result.partnerships[1].recordIds).toEqual(['c', 'd'])
    })

    it('never merges two different records that both happen to have a blank Plus Code', () => {
      const records: EligibleRecord[] = [
        { id: 'a', plusCode: '' },
        { id: 'b', plusCode: null },
        { id: 'c', plusCode: '' },
      ]
      const result = calculateAssignment(records, 1, 3)
      expect(isAssignmentError(result)).toBe(false)
      if (isAssignmentError(result)) return
      // 3 separate singleton units all fit in one partnership of capacity 3 — if blanks had
      // merged into one unit, unassignedCount would incorrectly be 0 with fewer than 3 assigned,
      // or the partnership count math would be wrong for a larger example.
      expect(result.partnerships).toEqual([{ sequence: 1, recordIds: ['a', 'b', 'c'] }])
    })

    it('caps partnerships by unit count, not raw record count, once households are large', () => {
      // 3 households of 3 people each = 9 raw records but only 3 units — at maxPerPartnership=2
      // units, that's ceil(3/2)=2 possible partnerships, not ceil(9/2)=5.
      const records: EligibleRecord[] = ['AAA', 'BBB', 'CCC'].flatMap((code) => [
        { id: `${code}-1`, plusCode: code },
        { id: `${code}-2`, plusCode: code },
        { id: `${code}-3`, plusCode: code },
      ])
      const result = calculateAssignment(records, 5, 2)
      expect(isAssignmentError(result)).toBe(false)
      if (isAssignmentError(result)) return
      expect(result.partnerships).toHaveLength(2)
      expect(result.partnerships[0].recordIds).toEqual(['AAA-1', 'AAA-2', 'AAA-3', 'BBB-1', 'BBB-2', 'BBB-3'])
      expect(result.partnerships[1].recordIds).toEqual(['CCC-1', 'CCC-2', 'CCC-3'])
      expect(result.unassignedCount).toBe(0)
    })
  })

  // Regression coverage for a reported bug: assignment must always give every partnership except
  // the last one exactly maxPerPartnership records, never fewer — even though block clustering
  // used to defer whole blocks to a later partnership and could leave an earlier one under-full
  // (confirmed with Russell: even counts win over keeping a block together).
  it('gives every partnership but the last exactly maxPerPartnership records, in order', () => {
    const records = noPlusCode(Array.from({ length: 24 }, (_, i) => `r${i}`))
    const result = calculateAssignment(records, 5, 5)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    expect(result.partnerships).toHaveLength(5)
    expect(result.partnerships.map((p) => p.recordIds.length)).toEqual([5, 5, 5, 5, 4])
    expect(result.unassignedCount).toBe(0)
  })

  // The engine itself has no notion of section/block — it only ever sees a flat, already-sorted
  // id list (see fetchEligibleRecordIds/queries.ts, which sorts territory -> section.sort_order ->
  // block.sort_order -> staleness before calling in). This test stands in for that pre-sorted
  // order using ids named after their section/block ("s1b1-*" = section 1, block 1) and confirms
  // the engine never reorders or interleaves them: it only ever walks the queue front-to-back, so
  // a partnership's records are always a contiguous run of the geographic order it was given —
  // never records "randomly" pulled from a later block while an earlier one still has records
  // left unassigned. A block that doesn't divide evenly is split at the exact point the count
  // requires (never early, never skipping ahead), and only the true last partnership gets a
  // partial (remainder) count.
  it('walks pre-sorted section/block order strictly front-to-back, splitting a block only where the count requires it', () => {
    const records = noPlusCode([
      's1b1-1', 's1b1-2', 's1b1-3', // section 1, block 1: 3 records
      's1b2-1', 's1b2-2', // section 1, block 2: 2 records
      's2b1-1', 's2b1-2', 's2b1-3', 's2b1-4', // section 2, block 1: 4 records
    ])
    const result = calculateAssignment(records, 3, 3)
    expect(isAssignmentError(result)).toBe(false)
    if (isAssignmentError(result)) return
    // Partnership 1 fills from block s1b1 alone (exactly 3, no need to reach into s1b2).
    expect(result.partnerships[0].recordIds).toEqual(['s1b1-1', 's1b1-2', 's1b1-3'])
    // Partnership 2 continues immediately where partnership 1 left off: all of s1b2, then the
    // first record of s2b1 — never skipping ahead or pulling from further down the queue.
    expect(result.partnerships[1].recordIds).toEqual(['s1b2-1', 's1b2-2', 's2b1-1'])
    // Partnership 3 (the last) picks up exactly where partnership 2 left off and gets the
    // remainder, even though that's fewer than maxPerPartnership.
    expect(result.partnerships[2].recordIds).toEqual(['s2b1-2', 's2b1-3', 's2b1-4'])
    expect(result.unassignedCount).toBe(0)
  })
})
