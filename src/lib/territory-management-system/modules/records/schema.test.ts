import { describe, it, expect } from 'vitest'
import { getSelectableResults, isDoNotCallLocked, isPartnershipAllDone, VISIT_RESULT_LABELS } from './schema'

function record(overrides: Partial<Parameters<typeof isPartnershipAllDone>[0][number]> = {}) {
  return {
    id: 'r1',
    plusCode: null,
    completedAt: null,
    doNotCall: false,
    doNotCallAt: null,
    ...overrides,
  }
}

describe('isDoNotCallLocked', () => {
  it('is false when do_not_call is off', () => {
    expect(isDoNotCallLocked(false, new Date().toISOString())).toBe(false)
  })

  it('is false when do_not_call is on but there is no timestamp', () => {
    expect(isDoNotCallLocked(true, null)).toBe(false)
  })

  it('is true within the 6-month lock window', () => {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    expect(isDoNotCallLocked(true, oneMonthAgo.toISOString())).toBe(true)
  })

  it('is false once the lock window has passed', () => {
    const sevenMonthsAgo = new Date()
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7)
    expect(isDoNotCallLocked(true, sevenMonthsAgo.toISOString())).toBe(false)
  })
})

describe('isPartnershipAllDone', () => {
  it('is false for a partnership with zero assigned records (searching a fresh territory)', () => {
    expect(isPartnershipAllDone([])).toBe(false)
  })

  it('is true once every record is completed', () => {
    expect(
      isPartnershipAllDone([
        record({ id: 'a', completedAt: '2026-01-01T00:00:00Z' }),
        record({ id: 'b', completedAt: '2026-01-01T00:00:00Z' }),
      ])
    ).toBe(true)
  })

  it('is false while any non-locked record is still uncompleted', () => {
    expect(
      isPartnershipAllDone([record({ id: 'a', completedAt: '2026-01-01T00:00:00Z' }), record({ id: 'b', completedAt: null })])
    ).toBe(false)
  })

  it('excuses a record still locked under the Do Not Call cooldown, even with no completed_at', () => {
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    expect(
      isPartnershipAllDone([
        record({ id: 'a', completedAt: '2026-01-01T00:00:00Z' }),
        record({ id: 'b', completedAt: null, doNotCall: true, doNotCallAt: oneMonthAgo.toISOString() }),
      ])
    ).toBe(true)
  })

  it('does not excuse a record whose Do Not Call lock has already expired', () => {
    const sevenMonthsAgo = new Date()
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7)
    expect(
      isPartnershipAllDone([
        record({ id: 'a', completedAt: '2026-01-01T00:00:00Z' }),
        record({ id: 'b', completedAt: null, doNotCall: true, doNotCallAt: sevenMonthsAgo.toISOString() }),
      ])
    ).toBe(false)
  })

  // Real bug found live (2026-07-19): a multi-record household only ever gets completed_at
  // stamped on whichever single record the visit was logged against — the sibling record(s)
  // never get their own completed_at. An un-grouped every-record check could never reach "done"
  // for a household even after the whole address was genuinely visited, blocking Sync & Finish.
  it('treats a household (shared Plus Code) as done once any one member is completed', () => {
    expect(
      isPartnershipAllDone([
        record({ id: 'a', plusCode: 'PLUS1', completedAt: '2026-01-01T00:00:00Z' }),
        record({ id: 'b', plusCode: 'PLUS1', completedAt: null }),
      ])
    ).toBe(true)
  })

  it('does not treat two different blank-Plus-Code records as the same household', () => {
    expect(
      isPartnershipAllDone([
        record({ id: 'a', plusCode: null, completedAt: '2026-01-01T00:00:00Z' }),
        record({ id: 'b', plusCode: null, completedAt: null }),
      ])
    ).toBe(false)
  })
})

// Funnel as of 2026-07-20: Potential BS -> Started Bible Study -> Progressive BS ->
// Discontinued/No Positive Response/Unlocated, with the old intermediate "Bible Study"
// confirmation step removed. Follow-up updated same-day: Potential BS no longer offers
// re-confirming itself, and Started Bible Study/Progressive BS gained a third "Discontinued"
// outcome distinct from "No Positive Response".
describe('getSelectableResults', () => {
  it('never offers "Bible Study" as a choice, from any starting state', () => {
    for (const latest of [null, 'return_visit', 'potential_bible_study', 'started_bible_study', 'progressing', 'bible_study']) {
      expect(getSelectableResults(latest)).not.toContain('bible_study')
    }
  })

  it('a cold start (no prior visit) does not offer Started Bible Study either', () => {
    expect(getSelectableResults(null)).not.toContain('started_bible_study')
    expect(getSelectableResults(null)).toContain('potential_bible_study')
  })

  it('a cold start does not offer "Discontinued" (study_discontinued) — only reachable as a follow-up', () => {
    expect(getSelectableResults(null)).not.toContain('study_discontinued')
  })

  it('Potential BS narrows to Potential BS / Started Bible Study / No Positive Response', () => {
    expect([...getSelectableResults('potential_bible_study')].sort()).toEqual(
      ['discontinued', 'potential_bible_study', 'started_bible_study'].sort()
    )
  })

  it('Started Bible Study narrows to Progressive BS / No Positive Response / Discontinued (skips Bible Study)', () => {
    expect([...getSelectableResults('started_bible_study')].sort()).toEqual(
      ['discontinued', 'progressing', 'study_discontinued'].sort()
    )
  })

  it('Progressive BS keeps narrowing to the same follow-up set', () => {
    expect([...getSelectableResults('progressing')].sort()).toEqual(['discontinued', 'progressing', 'study_discontinued'].sort())
  })

  it('a legacy record whose latest result is already "bible_study" still narrows to the follow-up set', () => {
    expect([...getSelectableResults('bible_study')].sort()).toEqual(['discontinued', 'progressing', 'study_discontinued'].sort())
  })
})

describe('VISIT_RESULT_LABELS', () => {
  it('labels "other" as "Busy"', () => {
    expect(VISIT_RESULT_LABELS.other).toBe('Busy')
  })

  it('labels "study_discontinued" as "Discontinued BS", distinct from "discontinued"\'s "No Positive Response"', () => {
    expect(VISIT_RESULT_LABELS.study_discontinued).toBe('Discontinued BS')
    expect(VISIT_RESULT_LABELS.discontinued).toBe('No Positive Response')
  })
})
