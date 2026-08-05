import { describe, it, expect, vi, afterEach } from 'vitest'
import { notesWeekRange } from './date'

function setToday(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${iso}T12:00:00Z`))
}

afterEach(() => {
  vi.useRealTimers()
})

// 2026-07-13 (Mon) - 2026-07-19 (Sun) is "week A"; 2026-07-20 (Mon) - 2026-07-26 (Sun) is
// "week B"; 2026-07-27 is the Monday starting "week C".
describe('notesWeekRange', () => {
  it('shows the just-finished week all the way through its own final Sunday', () => {
    setToday('2026-07-19')
    expect(notesWeekRange('UTC')).toEqual({ start: '2026-07-13', end: '2026-07-19' })
  })

  it('still shows the just-finished week on the new week\'s Monday (the grace day)', () => {
    setToday('2026-07-20')
    expect(notesWeekRange('UTC')).toEqual({ start: '2026-07-13', end: '2026-07-19' })
  })

  it('rolls over to the new week on Tuesday', () => {
    setToday('2026-07-21')
    expect(notesWeekRange('UTC')).toEqual({ start: '2026-07-20', end: '2026-07-26' })
  })

  it('keeps showing the same week for the rest of it, through Sunday', () => {
    setToday('2026-07-26')
    expect(notesWeekRange('UTC')).toEqual({ start: '2026-07-20', end: '2026-07-26' })
  })

  it('rolls over again the following Monday\'s grace day (stays on week B, not week C)', () => {
    setToday('2026-07-27')
    expect(notesWeekRange('UTC')).toEqual({ start: '2026-07-20', end: '2026-07-26' })
  })

  it('a mid-week Tuesday still resolves to that same week', () => {
    setToday('2026-07-14')
    expect(notesWeekRange('UTC')).toEqual({ start: '2026-07-13', end: '2026-07-19' })
  })
})
