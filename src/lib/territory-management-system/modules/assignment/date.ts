// Settings-form input is validated (congregation/schema.ts), but rows written outside the app
// (manual SQL provisioning, direct DB edits) aren't — an invalid IANA zone would otherwise throw
// a RangeError deep inside Intl and crash every page that renders a congregation-local date.
// Falling back to UTC keeps the dashboard usable instead of a hard 500.
export function safeTimezone(timezone: string): string {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return timezone
  } catch {
    return 'UTC'
  }
}

// en-CA formats as YYYY-MM-DD, exactly what a Postgres `date` column expects. Shared by the
// Group Leader dashboard (to look up whether today's batch already exists) and
// createGroupLeaderAssignmentAction (to compute the same date server-side at submit time).
export function todayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: safeTimezone(timezone) })
}

// Formats a YYYY-MM-DD date string (e.g. from todayInTimezone) as "Tuesday, July 7, 2026" — for
// the Group Leader dashboard's "Select Territory For Today" header. Parses the date parts
// directly and formats with timeZone: 'UTC' rather than passing the string through `new Date()`
// and a second timezone conversion — the date is already the correct congregation-local calendar
// day by the time it gets here, so this just spells it out in words without risking a day-shift
// from the server's own timezone.
export function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// A batch is "expired" once its assignment_date is before today in the congregation's own
// timezone — publisher-facing QR/claim links for it stop working the next day, but nothing
// about the batch or its data is ever deleted (Reports and history still read it normally).
// String comparison is safe here since both sides are YYYY-MM-DD.
export function isBatchExpired(assignmentDate: string, timezone: string): boolean {
  return assignmentDate < todayInTimezone(timezone)
}

// Converts a naive `<input type="datetime-local">` value (e.g. "2026-07-20T14:45" — no
// timezone attached at all) into the correct UTC instant for the given IANA timezone. Both
// VisitLogForm (admin) and PublisherVisitLogForm capture this string straight from the
// submitter's own device clock, but it used to be handed to `new Date(str).toISOString()`
// server-side — which interprets a timezone-less string using the SERVER's own local time
// (UTC on Vercel), not the congregation's. For a Philippines congregation (UTC+8) that silently
// shifted every logged visit 8 hours later, occasionally rolling it into the next calendar day.
//
// Works without a timezone-database dependency, but deliberately avoids the common
// `new Date(someLocaleString)` trick for finding a zone's UTC offset — that trick re-parses a
// timezone-less string, which is exactly the ambient-environment-dependent behavior this
// function exists to route around, and silently produces a zero (or wrong) offset whenever the
// runtime's own default timezone happens to already be non-UTC. Instead: read the input's
// numeric components directly, guess a UTC instant from them, use Intl.formatToParts (explicit
// `timeZone`, no ambient-zone dependency at all) to see what that guess reads as in the target
// zone, and correct by the difference — the zone's real UTC offset at that moment.
export function localDatetimeToUtcIso(dateTimeLocal: string, timezone: string): string {
  const zone = safeTimezone(timezone)
  const match = dateTimeLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return new Date(dateTimeLocal).toISOString()
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second || 0)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(guessUtcMs))
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // hour12:false can format midnight as "24" in some engines' Intl implementations — normalize.
  const wallAsUtcMs = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour') % 24, part('minute'), part('second'))

  const zoneOffsetMs = wallAsUtcMs - guessUtcMs
  return new Date(guessUtcMs - zoneOffsetMs).toISOString()
}
