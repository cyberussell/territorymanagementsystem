import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BIBLE_STUDY_ONGOING_RESULTS, isDoNotCallLocked, VISIT_RESULTS } from '../records/schema'
import type { VisitResult } from '../records/types'
import { getBatchSummary } from '../assignment/queries'
import type { PartnershipWithProgress } from '../assignment/types'
import { endOfDayUtcExclusive, startOfDayUtc, type DateRange } from './date'

export interface ReportStats {
  totalRecords: number
  completedRecords: number
  remainingRecords: number
  completionPct: number
  resultCounts: Record<VisitResult, number>
  newRecordsSubmitted: number
}

export interface BatchStats extends ReportStats {
  activeBibleStudies: number
  partnerships: PartnershipWithProgress[]
  // Today's assigned territories, for the Home tab's "territories worked today" summary once
  // every partner is done, and the QR card's barangay-name heading before that.
  territories: { id: string; name: string; description: string }[]
  // Earliest/latest territory_record_visits.visited_at among this batch's own assigned records
  // today — null when nobody has logged a visit yet. Derived from the same visit rows
  // getBatchVisitResultCounts already fetches (ordered newest-first), not a separate query.
  firstVisitedAt: string | null
  lastVisitedAt: string | null
}

function emptyResultCounts(): Record<VisitResult, number> {
  return Object.fromEntries(VISIT_RESULTS.map((r) => [r, 0])) as Record<VisitResult, number>
}

async function recordIdsForTerritories(supabase: SupabaseClient, congregationId: string, territoryIds: string[]): Promise<string[]> {
  const { data } = await supabase
    .from('territory_records')
    .select('id')
    .eq('congregation_id', congregationId)
    .in('territory_id', territoryIds)
  return (data ?? []).map((r) => r.id)
}

async function getVisitResultCounts(
  supabase: SupabaseClient,
  congregationId: string,
  territoryIds: string[] | null,
  rangeStart: string,
  rangeEnd: string
): Promise<Record<VisitResult, number>> {
  let query = supabase
    .from('territory_record_visits')
    .select('record_id, result, visited_at')
    .eq('congregation_id', congregationId)
    .gte('visited_at', rangeStart)
    .lt('visited_at', rangeEnd)
    .order('visited_at', { ascending: false })
  if (territoryIds) {
    const recordIds = await recordIdsForTerritories(supabase, congregationId, territoryIds)
    if (recordIds.length === 0) return emptyResultCounts()
    query = query.in('record_id', recordIds)
  }

  const { data } = await query
  const counts = emptyResultCounts()
  // A record can be visited more than once in the range (e.g. re-visited later the same day) —
  // only its most recent visit should count toward the breakdown, so one record never
  // contributes more than once. Rows are ordered newest-first, so the first time a given
  // record_id is seen here is already its latest result.
  const seenRecordIds = new Set<string>()
  for (const row of (data ?? []) as { record_id: string; result: VisitResult; visited_at: string }[]) {
    if (seenRecordIds.has(row.record_id)) continue
    seenRecordIds.add(row.record_id)
    counts[row.result] = (counts[row.result] ?? 0) + 1
  }
  return counts
}

async function countNewPublisherRecords(
  supabase: SupabaseClient,
  congregationId: string,
  territoryIds: string[] | null,
  rangeStart: string,
  rangeEnd: string
): Promise<number> {
  let query = supabase
    .from('territory_records')
    .select('id', { count: 'exact', head: true })
    .eq('congregation_id', congregationId)
    .eq('source', 'publisher')
    .gte('created_at', rangeStart)
    .lt('created_at', rangeEnd)
  if (territoryIds) query = query.in('territory_id', territoryIds)
  const { count } = await query
  return count ?? 0
}

// "Bible Studies in the Area" (Group Leader Dashboard tab only, confirmed with Russell): a
// record counts if its most recent visit ever — not just one logged today — is anywhere in the
// "ongoing study" family (BIBLE_STUDY_ONGOING_RESULTS: started_bible_study/progressing, plus the
// legacy-only 'bible_study' for records logged before that intermediate step was removed from
// the funnel on 2026-07-20). A study runs over weeks, so unlike getVisitResultCounts this
// deliberately has no date range; scoped to today's batch's territories (also confirmed), same
// as the tab's other stats.
async function countActiveBibleStudies(supabase: SupabaseClient, congregationId: string, territoryIds: string[]): Promise<number> {
  const recordIds = await recordIdsForTerritories(supabase, congregationId, territoryIds)
  if (recordIds.length === 0) return 0

  const { data } = await supabase
    .from('territory_record_visits')
    .select('record_id, result, visited_at')
    .eq('congregation_id', congregationId)
    .in('record_id', recordIds)
    .order('visited_at', { ascending: false })

  // Same "rows ordered newest-first, first time we see a record_id is its latest result"
  // de-dup pattern as getVisitResultCounts.
  const ongoing = BIBLE_STUDY_ONGOING_RESULTS as readonly string[]
  const seenRecordIds = new Set<string>()
  let count = 0
  for (const row of (data ?? []) as { record_id: string; result: VisitResult }[]) {
    if (seenRecordIds.has(row.record_id)) continue
    seenRecordIds.add(row.record_id)
    if (ongoing.includes(row.result)) count++
  }
  return count
}

// The Group Leader Home tab's "completed today" breakdown, strictly scoped to THIS batch's own
// assigned records — not getVisitResultCounts' broader "any visit logged today anywhere in
// these territories," which double-counts whenever the same Group Leader also has a second
// batch (e.g. an overflow one) touching the same territory the same day, or a prior day's batch
// left a record whose territory overlaps. Two of the buckets below never come from an actual
// territory_record_visits row:
//  - 'undone': terminatePartnershipEarly (Group Leader force-end or a publisher's own Early Out)
//    deliberately never writes a visit row (see its own comment — a synthetic one used to
//    corrupt the rotation staleness signal) — so an assigned record still incomplete once its
//    partnership has ended_early_at is derived as undone here instead.
//  - 'do_not_call': a record still inside its 6-month lock (see isDoNotCallLocked) can't have
//    had a visit logged against it at all today, structurally — it still belongs in the
//    breakdown as do_not_call rather than silently vanishing from the totals.
// A record with neither an actual visit, an ended-early partnership, nor an active lock simply
// isn't counted in any bucket — it's still in progress, which the separate remainingRecords
// stat already covers.
interface BatchVisitBreakdown {
  counts: Record<VisitResult, number>
  // Earliest/latest visited_at among this batch's own visit rows today — derived from the same
  // fetch below (already ordered newest-first) rather than a separate query.
  firstVisitedAt: string | null
  lastVisitedAt: string | null
}

async function getBatchVisitResultCounts(
  supabase: SupabaseClient,
  congregationId: string,
  batchId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<BatchVisitBreakdown> {
  const counts = emptyResultCounts()
  const empty: BatchVisitBreakdown = { counts, firstVisitedAt: null, lastVisitedAt: null }

  const { data: partnerships } = await supabase.from('partnerships').select('id, ended_early_at').eq('batch_id', batchId)
  const endedEarlyByPartnership = new Map(
    ((partnerships ?? []) as { id: string; ended_early_at: string | null }[]).map((p) => [p.id, Boolean(p.ended_early_at)])
  )
  const partnershipIds = [...endedEarlyByPartnership.keys()]
  if (partnershipIds.length === 0) return empty

  const { data: assigned } = await supabase.from('partnership_records').select('partnership_id, record_id').in('partnership_id', partnershipIds)
  const assignedRows = (assigned ?? []) as { partnership_id: string; record_id: string }[]
  if (assignedRows.length === 0) return empty

  const recordIds = assignedRows.map((r) => r.record_id)

  const [{ data: visits }, { data: records }] = await Promise.all([
    supabase
      .from('territory_record_visits')
      .select('record_id, result, visited_at')
      .eq('congregation_id', congregationId)
      .in('record_id', recordIds)
      .gte('visited_at', rangeStart)
      .lt('visited_at', rangeEnd)
      .order('visited_at', { ascending: false }),
    supabase.from('territory_records').select('id, do_not_call, do_not_call_at').in('id', recordIds),
  ])

  const visitRows = (visits ?? []) as { record_id: string; result: VisitResult; visited_at: string }[]

  // Same "rows ordered newest-first, first time we see a record_id is its latest result"
  // de-dup pattern as getVisitResultCounts.
  const latestResultByRecord = new Map<string, VisitResult>()
  for (const row of visitRows) {
    if (!latestResultByRecord.has(row.record_id)) latestResultByRecord.set(row.record_id, row.result)
  }
  const lockedByRecord = new Map(
    ((records ?? []) as { id: string; do_not_call: boolean; do_not_call_at: string | null }[]).map((r) => [
      r.id,
      isDoNotCallLocked(r.do_not_call, r.do_not_call_at),
    ])
  )

  for (const row of assignedRows) {
    const visited = latestResultByRecord.get(row.record_id)
    if (visited) {
      counts[visited] = (counts[visited] ?? 0) + 1
    } else if (lockedByRecord.get(row.record_id)) {
      counts.do_not_call += 1
    } else if (endedEarlyByPartnership.get(row.partnership_id)) {
      counts.undone += 1
    }
  }

  return {
    counts,
    lastVisitedAt: visitRows[0]?.visited_at ?? null,
    firstVisitedAt: visitRows.length > 0 ? visitRows[visitRows.length - 1].visited_at : null,
  }
}

// Backs the Group Leader Dashboard (always today's own batch) — Reports (getReportStats below)
// deliberately computes its own congregation-wide, multi-day rollup instead of reusing this,
// since it's a broader admin tool where "every visit in range" is the right scope, not "just
// this one batch."
export async function getBatchStats(
  supabase: SupabaseClient,
  congregationId: string,
  batchId: string,
  timezone: string
): Promise<BatchStats | null> {
  const batch = await getBatchSummary(supabase, congregationId, batchId)
  if (!batch) return null

  // p.recordCount deliberately excludes locked Do Not Call records (see getBatchSummary's
  // `countable` filter) so a partnership's own progress card can read "2 of 2 completed" instead
  // of a confusing "2 of 4" for records nothing could be logged against today — dncCount is
  // shown alongside it there instead. This batch-wide total is a different question ("how many
  // records did today's assignment actually cover") where a locked record is still a real
  // distributed record, just one that's structurally untouched — so it's added back in here, and
  // deliberately left out of completedRecords, so remainingRecords below counts it correctly as
  // still-untouched rather than silently vanishing from both totals (Russell: DNC records must
  // stay part of "Records Untouched" so the batch total matches records actually assigned).
  const totalRecords = batch.partnerships.reduce((sum, p) => sum + p.recordCount + p.dncCount, 0)
  const completedRecords = batch.partnerships.reduce((sum, p) => sum + p.completedCount, 0)
  const territoryIds = batch.territories.map((t) => t.id)
  const rangeStart = startOfDayUtc(batch.assignment_date, timezone)
  const rangeEnd = endOfDayUtcExclusive(batch.assignment_date, timezone)

  const [{ counts: resultCounts, firstVisitedAt, lastVisitedAt }, newRecordsSubmitted, activeBibleStudies] = await Promise.all([
    getBatchVisitResultCounts(supabase, congregationId, batchId, rangeStart, rangeEnd),
    countNewPublisherRecords(supabase, congregationId, territoryIds, rangeStart, rangeEnd),
    countActiveBibleStudies(supabase, congregationId, territoryIds),
  ])

  return {
    totalRecords,
    completedRecords,
    remainingRecords: totalRecords - completedRecords,
    completionPct: totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0,
    resultCounts,
    newRecordsSubmitted,
    activeBibleStudies,
    partnerships: batch.partnerships,
    territories: batch.territories,
    firstVisitedAt,
    lastVisitedAt,
  }
}

// Sums per-batch stats that are safely additive (partnership-scoped: resultCounts, totalRecords,
// completedRecords — no record is ever assigned to more than one batch, see engine.ts) across
// every batch a Group Leader owns today (the regular assignment plus any auxiliary/overflow
// batches), so the Dashboard/Visits/Partners tabs and the post-completion Home tab summary read
// as one combined "today" total instead of forcing a per-batch view. newRecordsSubmitted and
// activeBibleStudies are deliberately NOT summed from the per-batch stats, though — both are
// territory-scoped queries rather than partnership-scoped, and an auxiliary batch can cover
// territory the regular batch already covers (auxiliary batches only ever extend territory
// already assigned today, never a brand new one) — summing those two specifically would
// double-count. Recomputed once here instead, over the deduplicated union of territories.
export async function getCombinedBatchStats(
  supabase: SupabaseClient,
  congregationId: string,
  batchStats: BatchStats[],
  today: string,
  timezone: string
): Promise<BatchStats> {
  const territoryById = new Map<string, { id: string; name: string; description: string }>()
  for (const b of batchStats) for (const t of b.territories) territoryById.set(t.id, t)
  const territories = [...territoryById.values()]
  const territoryIds = territories.map((t) => t.id)

  const resultCounts = emptyResultCounts()
  let totalRecords = 0
  let completedRecords = 0
  let firstVisitedAt: string | null = null
  let lastVisitedAt: string | null = null
  const partnerships: PartnershipWithProgress[] = []

  for (const b of batchStats) {
    totalRecords += b.totalRecords
    completedRecords += b.completedRecords
    partnerships.push(...b.partnerships)
    for (const r of VISIT_RESULTS) resultCounts[r] += b.resultCounts[r] ?? 0
    if (b.firstVisitedAt && (!firstVisitedAt || b.firstVisitedAt < firstVisitedAt)) firstVisitedAt = b.firstVisitedAt
    if (b.lastVisitedAt && (!lastVisitedAt || b.lastVisitedAt > lastVisitedAt)) lastVisitedAt = b.lastVisitedAt
  }

  const rangeStart = startOfDayUtc(today, timezone)
  const rangeEnd = endOfDayUtcExclusive(today, timezone)
  const [newRecordsSubmitted, activeBibleStudies] = await Promise.all([
    territoryIds.length > 0 ? countNewPublisherRecords(supabase, congregationId, territoryIds, rangeStart, rangeEnd) : 0,
    territoryIds.length > 0 ? countActiveBibleStudies(supabase, congregationId, territoryIds) : 0,
  ])

  return {
    totalRecords,
    completedRecords,
    remainingRecords: totalRecords - completedRecords,
    completionPct: totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0,
    resultCounts,
    newRecordsSubmitted,
    activeBibleStudies,
    partnerships,
    territories,
    firstVisitedAt,
    lastVisitedAt,
  }
}

export interface TerritoryReportRow {
  id: string
  name: string
  barangayName: string
  startedBibleStudy: number
  progressiveBibleStudy: number
  totalHouseholds: number
  totalRecords: number
}

// Per-territory snapshot for the admin Reports table (confirmed with Russell via 3 scope
// questions before building): Started Bible Study / Progressive BS reflect each record's current
// (most-recent-ever) visit result — no date range — same "active" definition
// countActiveBibleStudies already uses for the Group Leader Dashboard's single stat, just broken
// out per-territory and split into the two distinct results instead of one. Progressive BS was
// "Bible Study" (matched only latestResult === 'bible_study') until 2026-07-20, when that
// intermediate funnel step was removed — it now matches 'progressing' (the funnel's real ongoing
// stage past Started Bible Study), plus the legacy 'bible_study' result for records logged
// before the change, so historical data doesn't just disappear from this column. Total
// Households sums household_members only for approved records; Total Records counts every
// record regardless of status, matching territory/queries.ts's existing record_count meaning.
// Sorted by Total Households descending, per Russell's request.
export async function getTerritoryReportRows(supabase: SupabaseClient, congregationId: string): Promise<TerritoryReportRow[]> {
  const { data: territories } = await supabase
    .from('territories')
    .select('id, name, description')
    .eq('congregation_id', congregationId)
  if (!territories || territories.length === 0) return []

  const { data: records } = await supabase
    .from('territory_records')
    .select('id, territory_id, status, household_members')
    .eq('congregation_id', congregationId)

  const recordTerritoryById = new Map<string, string>()
  const totals = new Map<string, { totalHouseholds: number; totalRecords: number }>()
  for (const t of territories) totals.set(t.id, { totalHouseholds: 0, totalRecords: 0 })
  for (const r of (records ?? []) as { id: string; territory_id: string; status: string; household_members: number | null }[]) {
    recordTerritoryById.set(r.id, r.territory_id)
    const bucket = totals.get(r.territory_id)
    if (!bucket) continue
    bucket.totalRecords += 1
    if (r.status === 'approved') bucket.totalHouseholds += r.household_members ?? 0
  }

  const bibleStudyCounts = new Map<string, { startedBibleStudy: number; progressiveBibleStudy: number }>()
  for (const t of territories) bibleStudyCounts.set(t.id, { startedBibleStudy: 0, progressiveBibleStudy: 0 })

  const recordIds = [...recordTerritoryById.keys()]
  if (recordIds.length > 0) {
    const { data: visits } = await supabase
      .from('territory_record_visits')
      .select('record_id, result, visited_at')
      .eq('congregation_id', congregationId)
      .in('record_id', recordIds)
      .order('visited_at', { ascending: false })

    // Same "rows ordered newest-first, first time we see a record_id is its latest result"
    // de-dup pattern as getVisitResultCounts/countActiveBibleStudies.
    const seenRecordIds = new Set<string>()
    for (const row of (visits ?? []) as { record_id: string; result: VisitResult }[]) {
      if (seenRecordIds.has(row.record_id)) continue
      seenRecordIds.add(row.record_id)
      if (row.result !== 'started_bible_study' && row.result !== 'progressing' && row.result !== 'bible_study') continue
      const territoryId = recordTerritoryById.get(row.record_id)
      const bucket = territoryId ? bibleStudyCounts.get(territoryId) : undefined
      if (!bucket) continue
      if (row.result === 'started_bible_study') bucket.startedBibleStudy += 1
      else bucket.progressiveBibleStudy += 1
    }
  }

  return territories
    .map((t) => ({
      id: t.id as string,
      name: t.name as string,
      barangayName: (t.description as string) || '—',
      startedBibleStudy: bibleStudyCounts.get(t.id)?.startedBibleStudy ?? 0,
      progressiveBibleStudy: bibleStudyCounts.get(t.id)?.progressiveBibleStudy ?? 0,
      totalHouseholds: totals.get(t.id)?.totalHouseholds ?? 0,
      totalRecords: totals.get(t.id)?.totalRecords ?? 0,
    }))
    .sort((a, b) => b.totalHouseholds - a.totalHouseholds)
}

export interface RecordLocation {
  id: string
  address: string
  residentName: string
  plusCode: string
  territoryName: string
}

// Pin data for the Reports page's household distribution map — only approved records (same
// population as getTerritoryReportRows' Total Households) with a real Plus Code set (legacy/
// CSV-imported records can have a null one, see plus_code's nullable column). Decoding each
// Plus Code into a lat/lng happens client-side in HouseholdDistributionMap via the
// open-location-code package already used by lib/plusCode.ts — no geocoding API call needed.
// residentName backs the popup's fallback label (address, then name, then Plus Code) for a
// record with no address on file.
export async function getApprovedRecordLocations(supabase: SupabaseClient, congregationId: string): Promise<RecordLocation[]> {
  const { data } = await supabase
    .from('territory_records')
    // !territory_id required — territory_records now has three FKs to territories (its own
    // territory_id, plus move_recommended_territory_id from 033) so an unqualified embed is
    // ambiguous to PostgREST (same hazard documented on RECORD_WITH_LOCATION_SELECT).
    .select('id, address, resident_name, plus_code, territory:territories!territory_id(name)')
    .eq('congregation_id', congregationId)
    .eq('status', 'approved')
    .not('plus_code', 'is', null)

  return (
    (data ?? []) as unknown as {
      id: string
      address: string
      resident_name: string
      plus_code: string | null
      territory: { name: string }[] | null
    }[]
  )
    .filter((r): r is typeof r & { plus_code: string } => Boolean(r.plus_code))
    .map((r) => ({
      id: r.id,
      address: r.address,
      residentName: r.resident_name,
      plusCode: r.plus_code,
      territoryName: r.territory?.[0]?.name ?? '',
    }))
}

// Congregation-wide rollup across every batch whose assignment_date falls in the range —
// the Daily/Weekly/Monthly Reports view.
export async function getReportStats(
  supabase: SupabaseClient,
  congregationId: string,
  range: DateRange,
  timezone: string
): Promise<ReportStats> {
  const rangeStart = startOfDayUtc(range.start, timezone)
  const rangeEnd = endOfDayUtcExclusive(range.end, timezone)

  const { data: batches } = await supabase
    .from('assignment_batches')
    .select('id')
    .eq('congregation_id', congregationId)
    .gte('assignment_date', range.start)
    .lte('assignment_date', range.end)
  const batchIds = (batches ?? []).map((b) => b.id)

  let totalRecords = 0
  let completedRecords = 0
  if (batchIds.length > 0) {
    const { data: partnerships } = await supabase.from('partnerships').select('id').in('batch_id', batchIds)
    const partnershipIds = (partnerships ?? []).map((p) => p.id)
    if (partnershipIds.length > 0) {
      const { data: partnershipRecords } = await supabase
        .from('partnership_records')
        .select('completed_at')
        .in('partnership_id', partnershipIds)
      totalRecords = partnershipRecords?.length ?? 0
      completedRecords = (partnershipRecords ?? []).filter((r) => r.completed_at !== null).length
    }
  }

  const [resultCounts, newRecordsSubmitted] = await Promise.all([
    getVisitResultCounts(supabase, congregationId, null, rangeStart, rangeEnd),
    countNewPublisherRecords(supabase, congregationId, null, rangeStart, rangeEnd),
  ])

  return {
    totalRecords,
    completedRecords,
    remainingRecords: totalRecords - completedRecords,
    completionPct: totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0,
    resultCounts,
    newRecordsSubmitted,
  }
}

export interface TerritoryVisitHistoryEntry {
  territoryId: string
  // territories.name (e.g. "Q-11") / territories.description (barangay, e.g. "Santos Quezon") —
  // same "Territory Number — Barangay Name" pairing already used for the Group Leader's own
  // territory checklist (see group-leader/dashboard/page.tsx's activeTerritories).
  territoryName: string
  barangayName: string
  // Sorted Section labels (e.g. ["A", "B"]) with at least one visit in the window — deliberately
  // not filtered by which batch (House To House vs. Auxiliary Groups) the visit came from, since
  // territory_record_visits carries no batch/partnership-type distinction at all; a visit counts
  // toward this list regardless of which kind of assignment produced it.
  sectionLabels: string[]
  lastVisitedAt: string
}

// Every territory with at least one logged visit since sinceIso, for the Group Leader's
// "worked in the last month" list — so a Group Leader can see territory coverage over time
// instead of only today's snapshot (the Dashboard tab's other stat cards). Two plain queries
// rather than a nested embed through territory_record_visits -> territory_records -> territories/
// territory_sections — those two tables each carry more than one FK to territories/
// territory_sections (correction_recommended_*/move_recommended_*), the exact ambiguous-embed
// footgun this codebase has hit before (see RECORD_WITH_LOCATION_SELECT's own comment).
export async function getTerritoryVisitHistory(
  supabase: SupabaseClient,
  congregationId: string,
  sinceIso: string
): Promise<TerritoryVisitHistoryEntry[]> {
  const { data: visits } = await supabase
    .from('territory_record_visits')
    .select('record_id, visited_at')
    .eq('congregation_id', congregationId)
    .gte('visited_at', sinceIso)
  const visitRows = (visits ?? []) as { record_id: string; visited_at: string }[]
  if (visitRows.length === 0) return []

  const recordIds = Array.from(new Set(visitRows.map((v) => v.record_id)))
  const { data: records } = await supabase.from('territory_records').select('id, territory_id, section_id').in('id', recordIds)
  const recordById = new Map(((records ?? []) as { id: string; territory_id: string; section_id: string }[]).map((r) => [r.id, r]))

  const byTerritory = new Map<string, { lastVisitedAt: string; sectionIds: Set<string> }>()
  for (const v of visitRows) {
    const record = recordById.get(v.record_id)
    if (!record) continue
    const existing = byTerritory.get(record.territory_id)
    if (!existing) {
      byTerritory.set(record.territory_id, { lastVisitedAt: v.visited_at, sectionIds: new Set([record.section_id]) })
    } else {
      existing.sectionIds.add(record.section_id)
      if (v.visited_at > existing.lastVisitedAt) existing.lastVisitedAt = v.visited_at
    }
  }
  if (byTerritory.size === 0) return []

  const territoryIds = Array.from(byTerritory.keys())
  const [{ data: territories }, { data: sections }] = await Promise.all([
    supabase.from('territories').select('id, name, description').in('id', territoryIds),
    supabase
      .from('territory_sections')
      .select('id, label')
      .in('id', Array.from(new Set(Array.from(byTerritory.values()).flatMap((e) => Array.from(e.sectionIds))))),
  ])
  const territoryById = new Map(((territories ?? []) as { id: string; name: string; description: string }[]).map((t) => [t.id, t]))
  const sectionLabelById = new Map(((sections ?? []) as { id: string; label: string }[]).map((s) => [s.id, s.label]))

  return Array.from(byTerritory.entries())
    .map(([territoryId, { lastVisitedAt, sectionIds }]) => {
      const territory = territoryById.get(territoryId)
      return {
        territoryId,
        territoryName: territory?.name ?? '—',
        barangayName: territory?.description ?? '',
        sectionLabels: Array.from(sectionIds)
          .map((id) => sectionLabelById.get(id) ?? '?')
          .sort(),
        lastVisitedAt,
      }
    })
    .sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt)) // most recently visited first
}
