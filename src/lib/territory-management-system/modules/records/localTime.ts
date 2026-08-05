// Shared by VisitLogForm and PublisherVisitLogForm — both default their "visited at"
// datetime-local input to right now, in the browser's local time (not UTC), formatted the way
// <input type="datetime-local"> expects.
export function nowLocalDatetime(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
