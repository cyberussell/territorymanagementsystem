// Congregation-timezone-aware date boundaries. LMS's own reports module once shipped a bug
// where mixing local Date mutation with UTC toISOString slicing silently dropped every order
// from its bucket on any server not running in UTC — every boundary here is computed
// consistently from the congregation's IANA timezone instead, once, in one place.

import { safeTimezone, todayInTimezone } from '../assignment/date'

export interface DateRange {
  start: string // inclusive, YYYY-MM-DD
  end: string // inclusive, YYYY-MM-DD
}

export function dailyRange(timezone: string): DateRange {
  const today = todayInTimezone(timezone)
  return { start: today, end: today }
}

export function weeklyRange(timezone: string): DateRange {
  const today = todayInTimezone(timezone)
  const [y, m, d] = today.split('-').map(Number)
  const asDate = new Date(Date.UTC(y, m - 1, d))
  const dayOfWeek = asDate.getUTCDay() // 0 = Sunday
  const diffToMonday = (dayOfWeek + 6) % 7
  const monday = new Date(asDate)
  monday.setUTCDate(asDate.getUTCDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return { start: toIsoDate(monday), end: toIsoDate(sunday) }
}

// The admin's Weekly Notes menu (dashboard/weekly-notes) shows a Monday-Sunday window that does
// NOT advance to the new week the instant Monday begins — it keeps showing the just-finished
// week through all of Monday, only flipping over on Tuesday (Russell: admins review the past
// week's notes at their Tuesday meeting, so Monday should still show the just-finished week's
// complete notes rather than an empty new one that only just started). Deliberately a separate
// function from weeklyRange above (used by the existing Reports Daily/Weekly/Monthly toggle,
// whose "this week" meaning is unrelated and must stay untouched) — same Monday-Sunday math,
// just evaluated against "yesterday" instead of "today" whenever today is a Monday.
export function notesWeekRange(timezone: string): DateRange {
  const today = todayInTimezone(timezone)
  const [y, m, d] = today.split('-').map(Number)
  const asDate = new Date(Date.UTC(y, m - 1, d))
  if (asDate.getUTCDay() === 1) asDate.setUTCDate(asDate.getUTCDate() - 1)
  const dayOfWeek = asDate.getUTCDay()
  const diffToMonday = (dayOfWeek + 6) % 7
  const monday = new Date(asDate)
  monday.setUTCDate(asDate.getUTCDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return { start: toIsoDate(monday), end: toIsoDate(sunday) }
}

export function monthlyRange(timezone: string): DateRange {
  const today = todayInTimezone(timezone)
  const [y, m] = today.split('-').map(Number)
  const firstDay = new Date(Date.UTC(y, m - 1, 1))
  const lastDay = new Date(Date.UTC(y, m, 0))
  return { start: toIsoDate(firstDay), end: toIsoDate(lastDay) }
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function timezoneOffsetString(timezone: string, atDate: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: safeTimezone(timezone), timeZoneName: 'shortOffset' }).formatToParts(atDate)
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
  const match = offsetPart.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/)
  if (!match) return '+00:00'
  const sign = match[1].startsWith('-') ? '-' : '+'
  const hours = Math.abs(Number(match[1])).toString().padStart(2, '0')
  const minutes = (match[2] ?? '00').padStart(2, '0')
  return `${sign}${hours}:${minutes}`
}

// Inclusive lower bound for querying timestamptz columns by a congregation-local calendar date.
export function startOfDayUtc(dateStr: string, timezone: string): string {
  const offset = timezoneOffsetString(timezone, new Date(`${dateStr}T00:00:00Z`))
  return new Date(`${dateStr}T00:00:00${offset}`).toISOString()
}

// Exclusive upper bound (start of the *next* local day) — pair with startOfDayUtc via
// `.gte(start).lt(end)` so the range is a clean, non-overlapping [start, end) window.
export function endOfDayUtcExclusive(dateStr: string, timezone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1))
  return startOfDayUtc(toIsoDate(nextDay), timezone)
}
