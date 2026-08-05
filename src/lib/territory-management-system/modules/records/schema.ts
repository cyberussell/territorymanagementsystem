import { z } from 'zod'

// Shared by actions/records.ts and RecordForm/VisitLogForm's zodResolver.

export const VISIT_RESULTS = [
  'initial_visit',
  'return_visit',
  'potential_bible_study',
  'started_bible_study',
  'bible_study',
  'progressing',
  'discontinued',
  // Distinct from 'discontinued' ("No Positive Response") as of 2026-07-20 — that one is the
  // dead-end from Potential BS (interest never really took), this one is a study that was
  // genuinely underway (Started Bible Study / Progressive BS) and then stopped. See
  // BIBLE_STUDY_FOLLOWUP_RESULTS below for where it's offered.
  'study_discontinued',
  'not_home',
  'do_not_call',
  'moved',
  'other',
  'undone',
] as const

// 'initial_visit' is the implicit state of any record with zero logged visits (see
// VISIT_RESULT_LABELS.initial_visit used as a display fallback in AssignedRecordsList,
// PublisherRecordDetailView, and the admin record detail page) — a publisher never chooses it
// as an outcome, so like 'undone' (written only by terminatePartnershipEarly, never picked
// manually) it's excluded from the dropdown both visit-log forms present to a human.
// 'progressing'/'discontinued' are excluded too — they only ever appear via
// BIBLE_STUDY_FOLLOWUP_RESULTS below, once a record is already an ongoing Bible Study.
// 'started_bible_study' is excluded from the default pool too — it's now only reachable as a
// locked follow-up once a record is already 'potential_bible_study' (see
// POTENTIAL_BIBLE_STUDY_RESULTS below), not something a publisher can pick from a cold start.
// 'bible_study' is excluded as of 2026-07-20 (Russell's request) — the funnel used to require a
// separate "confirm it's now Bible Study" step between Started Bible Study and Progressive BS;
// it's now a direct Potential BS -> Started Bible Study -> Progressive BS -> Discontinued/Moved
// flow with 'bible_study' skipped entirely going forward. Kept in VISIT_RESULTS itself (not
// deleted) purely so already-logged historical visits with this result still render a correct
// label/color/badge — same treatment as 'undone'/'initial_visit'/'progressing'/'discontinued'.
export const SELECTABLE_VISIT_RESULTS = VISIT_RESULTS.filter(
  (r) =>
    r !== 'undone' &&
    r !== 'initial_visit' &&
    r !== 'progressing' &&
    r !== 'discontinued' &&
    r !== 'started_bible_study' &&
    r !== 'bible_study' &&
    // 'study_discontinued' is excluded from the cold-start pool for the same reason — only ever
    // reachable as a follow-up once a study was already underway (BIBLE_STUDY_FOLLOWUP_RESULTS),
    // never a result a publisher picks on a record with no study history.
    r !== 'study_discontinued'
)

// Once a record's most recent visit means a study is already confirmed underway, the next
// visit's Status choices narrow to just these three follow-up outcomes instead of the full list.
// 'started_bible_study' is included here (not just its own separate branch) precisely because
// the funnel no longer has a distinct "confirm it's now Bible Study" step in between — the very
// next visit after Started Bible Study already offers Progressive BS / No Positive Response /
// Unlocated. 'bible_study' stays in this set too, but only so an already-existing historical
// record (logged before this change) still narrows correctly instead of falling through to the
// full default pool — it can never be the CURRENT selection going forward (see
// SELECTABLE_VISIT_RESULTS above), only ever a past latestResult this check is matching against.
export const BIBLE_STUDY_ONGOING_RESULTS = ['started_bible_study', 'bible_study', 'progressing'] as const
// 'study_discontinued' added 2026-07-20 (Russell's request) alongside the existing
// 'discontinued' — Started Bible Study / Progressive BS's follow-up choices are now Progressive
// BS / No Positive Response / Discontinued, three distinct outcomes rather than two.
export const BIBLE_STUDY_FOLLOWUP_RESULTS = ['progressing', 'discontinued', 'study_discontinued', 'moved'] as const

// The Bible Study funnel's entry stage, with its own narrowed follow-up choices — evaluated in
// getSelectableResults() before the BIBLE_STUDY_ONGOING_RESULTS check above:
//   'potential_bible_study' ("Potential BS", the default-pool entry point) -> stays at
//     [potential_bible_study, started_bible_study, discontinued]. Re-confirming "Potential BS"
//     itself was removed 2026-07-20 then reinstated 2026-07-27 (both Russell's request) — a
//     genuine Bible Study interest can take several visits to actually start, so a publisher
//     needs to be able to log "still Potential BS" repeatedly rather than being forced to either
//     confirm "Started Bible Study" or dead-end to "No Positive Response" on the very next visit.
// From 'started_bible_study' onward, BIBLE_STUDY_ONGOING_RESULTS/BIBLE_STUDY_FOLLOWUP_RESULTS
// above take over directly — see the removed STARTED_BIBLE_STUDY_RESULTS note above.
export const POTENTIAL_BIBLE_STUDY_RESULTS = ['potential_bible_study', 'started_bible_study', 'discontinued'] as const

// Any visit result that should read as "there's an active Bible Study interest here" for
// card-tone purposes (see getRecordCardTone below) — a superset of the funnel/follow-up
// narrowing sets above, used purely for coloring, not for narrowing dropdown choices.
export const BIBLE_STUDY_FAMILY_RESULTS = [
  'potential_bible_study',
  'started_bible_study',
  'bible_study',
  'progressing',
] as const

// A record flagged do_not_call narrows to exactly these three outcomes, regardless of its
// latest visit result — takes priority over the Bible Study narrowing below (the two states
// are mutually exclusive in practice: a record already marked do_not_call never has an ongoing
// Bible Study to follow up on).
export const DO_NOT_CALL_RESULTS = ['do_not_call', 'moved', 'return_visit'] as const

// How long a freshly-flagged Do Not Call record stays fully locked — no visit of any kind can
// be logged against it — before a publisher can act on it again (see getSelectableResults
// returning an empty array during the lock, and do_not_call_at, stamped by a DB trigger, see
// 027_do_not_call_lock.sql).
export const DO_NOT_CALL_LOCK_MONTHS = 6

export function doNotCallUnlockDate(doNotCallAt: string): Date {
  const d = new Date(doNotCallAt)
  d.setMonth(d.getMonth() + DO_NOT_CALL_LOCK_MONTHS)
  return d
}

export function isDoNotCallLocked(doNotCall: boolean, doNotCallAt: string | null): boolean {
  if (!doNotCall || !doNotCallAt) return false
  return doNotCallUnlockDate(doNotCallAt).getTime() > Date.now()
}

// Whether a publisher's assigned records are all genuinely "handled" for the day — the gate for
// showing "Sync & Finish" instead of the assigned-records list. Grouped by Plus Code first: a
// multi-record household only ever gets completed_at stamped on whichever single record the
// visit was actually logged against (markPartnershipRecordCompleted never touches its household
// siblings), so checking every record individually could never reach "done" for a household even
// after the whole address was genuinely visited — the same household-counts-as-one-unit rule
// getBatchSummary's recordCount/completedCount already apply, just also needed here so the
// publisher's own device agrees with what the Group Leader's dashboard already shows. A locked
// Do Not Call record excuses its whole group the same way a completed visit does — there's
// structurally no visit a publisher can log against it. Empty input is never "done" — a
// zero-record ("searching a fresh territory") partnership only finishes via End Ministry Early.
export function isPartnershipAllDone(
  records: { id: string; plusCode: string | null; completedAt: string | null; doNotCall: boolean; doNotCallAt: string | null }[]
): boolean {
  if (records.length === 0) return false
  const groups = new Map<string, typeof records>()
  for (const r of records) {
    const key = r.plusCode || r.id
    const group = groups.get(key)
    if (group) group.push(r)
    else groups.set(key, [r])
  }
  return Array.from(groups.values()).every((group) => group.some((r) => r.completedAt || isDoNotCallLocked(r.doNotCall, r.doNotCallAt)))
}

// Returns the empty array while a Do Not Call record is still within its lock window — callers
// (VisitLogForm/PublisherVisitLogForm and whatever renders around them) treat zero options as
// "no visit can be logged right now" and show a locked notice instead of a dropdown.
//
// 'moved' is filtered out of every branch below, everywhere — it's never a plain Status pick, on
// either the publisher side (a dedicated "Mark as Moved" button forces Update Contact Record /
// Recommend for Admin Removal instead — see MarkMovedForm) or the Admin side (Admin can just
// edit the record directly, no forced flow needed). Filtering it here, at the single source both
// every UI dropdown *and* every server action's validation call through, means it's genuinely
// unselectable everywhere at once rather than hidden per-component.
export function getSelectableResults(
  latestResult?: string | null,
  doNotCall?: boolean,
  doNotCallAt?: string | null
): readonly Exclude<(typeof VISIT_RESULTS)[number], 'undone' | 'initial_visit' | 'moved'>[] {
  const pool = (() => {
    if (doNotCall) {
      if (isDoNotCallLocked(doNotCall, doNotCallAt ?? null)) return []
      return DO_NOT_CALL_RESULTS
    }
    if (latestResult === 'potential_bible_study') return POTENTIAL_BIBLE_STUDY_RESULTS
    if (latestResult && (BIBLE_STUDY_ONGOING_RESULTS as readonly string[]).includes(latestResult)) {
      return BIBLE_STUDY_FOLLOWUP_RESULTS
    }
    return SELECTABLE_VISIT_RESULTS
  })()
  return pool.filter((r) => r !== 'moved') as readonly Exclude<(typeof VISIT_RESULTS)[number], 'undone' | 'initial_visit' | 'moved'>[]
}

export const VISIT_RESULT_LABELS: Record<(typeof VISIT_RESULTS)[number], string> = {
  initial_visit: 'Initial Visit',
  return_visit: 'Visited Again',
  potential_bible_study: 'Potential BS',
  started_bible_study: 'Started Bible Study',
  bible_study: 'Bible Study',
  progressing: 'Progressive BS',
  // Renamed from "Discontinued" — same single shared label constant everywhere it's used,
  // including as the funnel's dead-end/no-interest outcome from Potential BS and Started Bible
  // Study, and as the existing ongoing-study follow-up in BIBLE_STUDY_FOLLOWUP_RESULTS.
  discontinued: 'No Positive Response',
  // Added 2026-07-20 — distinct from 'discontinued' above, see BIBLE_STUDY_FOLLOWUP_RESULTS.
  study_discontinued: 'Discontinued BS',
  not_home: 'Not At Home',
  do_not_call: 'Do Not Call',
  moved: 'Unlocated',
  // Renamed from "Other" 2026-07-20 (Russell's request) — same underlying 'other' value/notes
  // requirement, just a clearer label for "the person is busy right now."
  other: 'Busy',
  undone: 'Undone',
}

// Shared by VisitHistoryList and VisitResultBadge — one place for the color per result, so the
// two can never drift out of sync with each other (or with VISIT_RESULTS itself) the way the
// old inline copy once did.
export const VISIT_RESULT_STYLES: Record<(typeof VISIT_RESULTS)[number], string> = {
  initial_visit: 'bg-blue-50 text-[#2563EB]',
  return_visit: 'bg-sky-50 text-sky-600',
  potential_bible_study: 'bg-cyan-50 text-cyan-700',
  started_bible_study: 'bg-indigo-50 text-indigo-600',
  bible_study: 'bg-violet-50 text-violet-600',
  progressing: 'bg-emerald-50 text-emerald-600',
  discontinued: 'bg-gray-100 text-gray-500',
  study_discontinued: 'bg-stone-100 text-stone-600',
  not_home: 'bg-slate-100 text-slate-600',
  do_not_call: 'bg-red-50 text-red-600',
  moved: 'bg-amber-50 text-amber-600',
  other: 'bg-orange-50 text-orange-600',
  undone: 'bg-gray-100 text-gray-500',
}

// A record card's full-panel tone, one rule shared by both AssignedRecordsList (the publisher's
// card list) and PublisherRecordDetailView (the single-record contact card) — previously each
// had its own slightly different local cardToneClass, so a record could show red/green on the
// list but not the detail view (or vice versa). do_not_call is the persistent record flag, not
// just the latest visit result, and takes priority. Potential BS gets its own tone (yellow —
// interest shown, no confirmed study yet) split out from the rest of the Bible-Study family
// (green — Started Bible Study / Bible Study / Progressive BS, a study is actually happening),
// checked first since BIBLE_STUDY_FAMILY_RESULTS still includes 'potential_bible_study' itself.
export type RecordCardTone = 'do_not_call' | 'potential_bible_study' | 'bible_study' | 'moved' | 'default'

export function getRecordCardTone(doNotCall: boolean, latestResult?: string | null): RecordCardTone {
  if (doNotCall) return 'do_not_call'
  if (latestResult === 'potential_bible_study') return 'potential_bible_study'
  if (latestResult && (BIBLE_STUDY_FAMILY_RESULTS as readonly string[]).includes(latestResult)) return 'bible_study'
  if (latestResult === 'moved') return 'moved'
  return 'default'
}

// Both study-related results ask who's conducting it — worded differently since "started" vs.
// an already-ongoing study read differently to a publisher at the door — but land in the same
// place: folded into the visit's Notes (mergeConductorIntoNotes below), not a new DB column.
export const VISIT_RESULT_CONDUCTOR_PROMPT: Partial<Record<(typeof VISIT_RESULTS)[number], string>> = {
  started_bible_study: 'Name of the publisher',
  bible_study: 'Who is conducting the Bible Study?',
  progressing: 'Who is conducting the Bible Study?',
}

const CONDUCTOR_NAME_MAX = 80

// Folds the conductor name into the front of Notes with a fixed, greppable prefix rather than a
// new column — used by both the admin's server-side logVisitAction and the publisher's
// client-side PublisherVisitLogForm (merged before the offline queue item is even created, so
// the sync payload needs no special handling). Hard-capped at 500 to match every notes column's
// existing limit regardless of how long the name + free-text notes combine to be.
export function mergeConductorIntoNotes(conductorName: string, notes: string): string {
  const name = conductorName.trim().slice(0, CONDUCTOR_NAME_MAX)
  if (!name) return notes
  const prefix = `Conducted by: ${name}`
  const merged = notes.trim() ? `${prefix} — ${notes.trim()}` : prefix
  return merged.slice(0, 500)
}

// The inverse of mergeConductorIntoNotes — pulls the conductor's name back out of a prior
// visit's notes so PublisherVisitLogForm can pre-fill "Who is conducting the Bible Study?" once
// a study is already underway (result 'bible_study'/'progressing'), instead of asking the
// publisher to retype the same name every visit. Returns '' if the notes don't start with the
// fixed "Conducted by: " prefix (e.g. no prior study visit, or an Admin-edited note).
export function extractConductorFromNotes(notes: string): string {
  const match = /^Conducted by: (.+?)(?: — |$)/.exec(notes)
  return match ? match[1] : ''
}

// A blank form field arrives as '' — coerce that to undefined so householdMembers stays
// optional instead of coercing to 0 (a real headcount of "0" is different from "not recorded").
export const householdMembersField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().min(0).optional()
)

// Same idea as assignment/schema.ts's publisherHouseholdMembersField — a blank Household
// members field on the admin's Add Contact Record form defaults to 1 instead of staying unset,
// matching the publisher-facing rule (confirmed with Russell to bring Admin's Add form to
// parity). Only used by createRecordSchema below, not updateRecordSchema — editing an existing
// (possibly legacy/CSV-imported) record still leaves a blank value unset.
const householdMembersDefaultOneField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? 1 : v),
  z.coerce.number().int().min(0)
)

// A conditionally-rendered <input>/<textarea> (e.g. initialConductorName/initialNotes below,
// only shown once an initial status that needs one is picked) is simply absent from the DOM
// when its condition is false — a native <form action> then submits FormData with no such key
// at all, so formData.get() returns null for it. z.string().optional() only accepts undefined,
// not null, so passing that straight through fails validation even though the field was
// correctly left blank/hidden on purpose. This normalizes null the same as a blank string.
function optionalString(max: number) {
  return z.preprocess((v) => (v === null ? '' : v), z.string().max(max).optional().default(''))
}

// initialResult/initialConductorName/initialNotes let whoever's adding a brand-new record
// (admin or publisher) optionally seed its very first visit at creation time, instead of every
// new record always starting at the implicit blank "Initial Visit" state. A blank initialResult
// means "don't log a visit" — the two refinements below only kick in once one is actually
// chosen, reusing the exact same rules as logVisitSchema.
export const createRecordSchema = z
  .object({
    territoryId: z.string().uuid(),
    sectionId: z.string().uuid(),
    blockId: z.string().uuid(),
    // Optional — the new cross-territory CSV import has no address column at all (Plus Code is
    // the location identifier there instead), so address can no longer be required at the schema
    // level. Still capped the same as before.
    address: z.string().max(200).optional().default(''),
    unit: z.string().max(40).optional().default(''),
    residentName: z.string().max(120).optional().default(''),
    plusCode: z.string().min(1, 'Plus Code is required.').max(20),
    householdMembers: householdMembersDefaultOneField,
    notes: z.string().max(500).optional().default(''),
    doNotCall: z.coerce.boolean().optional().default(false),
    initialResult: z.string().optional().default(''),
    initialConductorName: optionalString(CONDUCTOR_NAME_MAX),
    initialNotes: optionalString(500),
    // Lets the Admin record which Ministry Partner actually made the visit, instead of the visit
    // always being attributed to whichever Admin happened to type it in — see partnerName below.
    initialPartnerName: optionalString(CONDUCTOR_NAME_MAX),
  })
  .refine((data) => !data.initialResult || data.initialResult !== 'other' || data.initialNotes.trim().length > 0, {
    message: 'Notes are required when the initial status is "Busy".',
    path: ['initialNotes'],
  })
  .refine(
    (data) =>
      !data.initialResult ||
      !VISIT_RESULT_CONDUCTOR_PROMPT[data.initialResult as keyof typeof VISIT_RESULT_CONDUCTOR_PROMPT] ||
      data.initialConductorName.trim().length > 0,
    { message: 'Please enter who is conducting the Bible Study.', path: ['initialConductorName'] }
  )
export type CreateRecordInput = z.input<typeof createRecordSchema>

export const updateRecordSchema = z.object({
  recordId: z.string().uuid(),
  address: z.string().max(200).optional().default(''),
  unit: z.string().max(40).optional().default(''),
  residentName: z.string().max(120).optional().default(''),
  plusCode: z.string().max(20).optional().default(''),
  householdMembers: householdMembersField,
  notes: z.string().max(500).optional().default(''),
  doNotCall: z.coerce.boolean().optional().default(false),
})
export type UpdateRecordInput = z.input<typeof updateRecordSchema>

export const logVisitSchema = z
  .object({
    recordId: z.string().uuid(),
    visitedAt: z.string().min(1),
    result: z.enum(VISIT_RESULTS),
    // conductorName is conditionally rendered in VisitLogForm (only shown when the picked
    // result needs one) — same null-vs-undefined gap optionalString() guards against above.
    conductorName: optionalString(CONDUCTOR_NAME_MAX),
    notes: z.string().max(500).optional().default(''),
    // Same purpose as createRecordSchema's initialPartnerName above — optional, always shown
    // (not conditional like conductorName), since the Admin may be logging on behalf of any
    // Ministry Partner regardless of which status is picked.
    partnerName: optionalString(CONDUCTOR_NAME_MAX),
  })
  .refine((data) => data.result !== 'other' || data.notes.trim().length > 0, {
    message: 'Notes are required when the result is "Busy".',
    path: ['notes'],
  })
  .refine((data) => !VISIT_RESULT_CONDUCTOR_PROMPT[data.result] || data.conductorName.trim().length > 0, {
    message: 'Please enter who is conducting the Bible Study.',
    path: ['conductorName'],
  })
export type LogVisitInput = z.input<typeof logVisitSchema>
