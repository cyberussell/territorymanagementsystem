import { describe, it, expect } from 'vitest'
import { localDatetimeToUtcIso } from './date'

describe('localDatetimeToUtcIso', () => {
  it('converts a Philippines (UTC+8) local time to the correct UTC instant', () => {
    expect(localDatetimeToUtcIso('2026-07-20T14:45', 'Asia/Manila')).toBe('2026-07-20T06:45:00.000Z')
  })

  it('rolls the calendar date backward when the local time crosses midnight in UTC', () => {
    // 12:30 AM Manila on the 20th is still 4:30 PM UTC on the 19th.
    expect(localDatetimeToUtcIso('2026-07-20T00:30', 'Asia/Manila')).toBe('2026-07-19T16:30:00.000Z')
  })

  it('is a no-op offset for UTC itself', () => {
    expect(localDatetimeToUtcIso('2026-07-20T14:45', 'UTC')).toBe('2026-07-20T14:45:00.000Z')
  })

  it('falls back to UTC (via safeTimezone) for an invalid timezone rather than throwing', () => {
    expect(localDatetimeToUtcIso('2026-07-20T14:45', 'Not/AZone')).toBe('2026-07-20T14:45:00.000Z')
  })

  it('handles a negative UTC offset correctly (US Eastern, UTC-4 in July)', () => {
    expect(localDatetimeToUtcIso('2026-07-20T14:45', 'America/New_York')).toBe('2026-07-20T18:45:00.000Z')
  })
})
