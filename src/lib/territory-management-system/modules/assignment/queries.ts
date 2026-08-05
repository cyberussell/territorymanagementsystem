import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateAssignment, isAssignmentError, type AssignmentError, type EligibleRecord } from './engine'
import { isBatchExpired } from './date'
import { getCongregationPlusCodeAnchor, getRecordsInBlocks, listRecordsAddedByPartnership } from '../records/queries'
import { BIBLE_STUDY_FAMILY_RESULTS, isDoNotCallLocked } from '../records/schema'
import type {
  AssignmentBatch,
  BatchSummary,
  IncomingRecordTransferRequest,
  Partnership,
  PartnershipRecordDetail,
  PartnershipWithProgress,
  PartnershipWorkspace,
  RecordSearchResult,
  RecordTransferRequestError,
} from './types'

// Fetches the eligible ('approved') record pool across the selected territories, in the
// canonical walking order the sequential engine relies on: territory selection order, then
// section sort_order, then block sort_order, then (within a block) oldest-last-visited-first —
// a record never visited at all sorts before every visited one. This is what actually produces
// rotation across successive assignment generations: a record's created_at never changes (so
// tiebreaking on that, the old behavior, would hand the same first N records in a block to
// every single assignment), but a record's latest visit date does, so a record worked today
// naturally sorts toward the back of its block next time and a long-neglected one surfaces
// first. Confirmed with Russell: section/block grouping stays the primary walking order (so a
// partnership's route stays geographically coherent) — staleness only breaks ties within a
// block, it doesn't reorder which block comes first. This ordering lives here (DB-facing), not
// in the pure engine, which only ever sees a pre-sorted id list.
async function fetchEligibleRecordIds(
  supabase: SupabaseClient,
  congregationId: string,
  territoryIds: string[]
): Promise<EligibleRecord[]> {
  const { data } = await supabase
    .from('territory_records')
    .select(
      // !section_id/!block_id required — territory_records has had two FKs to each of
      // territory_sections/territory_blocks since migration 030 (correction_recommended_*),
      // so an unqualified embed is ambiguous to PostgREST and silently returns zero rows
      // instead of erroring (see the matching comment on RECORD_WITH_LOCATION_SELECT).
      'id, territory_id, plus_code, created_at, section:territory_sections!section_id(sort_order), block:territory_blocks!block_id(sort_order)'
    )
    .eq('congregation_id', congregationId)
    .in('territory_id', territoryIds)
    .eq('status', 'approved')

  const territoryRank = new Map(territoryIds.map((id, index) => [id, index]))
  const rows = (data ?? []) as unknown as Array<{
    id: string
    territory_id: string
    plus_code: string | null
    created_at: string
    section: { sort_order: number } | null
    block: { sort_order: number } | null
  }>

  const latestVisitByRecord = await getLatestVisitDatesByRecord(
    supabase,
    rows.map((r) => r.id)
  )

  rows.sort((a, b) => {
    const territoryDiff = (territoryRank.get(a.territory_id) ?? 0) - (territoryRank.get(b.territory_id) ?? 0)
    if (territoryDiff !== 0) return territoryDiff
    const sectionDiff = (a.section?.sort_order ?? 0) - (b.section?.sort_order ?? 0)
    if (sectionDiff !== 0) return sectionDiff
    const blockDiff = (a.block?.sort_order ?? 0) - (b.block?.sort_order ?? 0)
    if (blockDiff !== 0) return blockDiff
    // '' sorts before any real ISO timestamp, so a never-visited record (no entry in the map)
    // is treated as infinitely old and always comes first within its block.
    const visitDiff = (latestVisitByRecord.get(a.id) ?? '').localeCompare(latestVisitByRecord.get(b.id) ?? '')
    if (visitDiff !== 0) return visitDiff
    return a.created_at.localeCompare(b.created_at)
  })

  return rows.map((r) => ({ id: r.id, plusCode: r.plus_code }))
}

// One query for the whole eligible pool rather than per-record, then reduced in JS to "first
// (newest) row per record_id" — same de-dup pattern already used by reports/queries.ts's
// activeBibleStudies count, kept consistent rather than introducing a GROUP BY variant.
async function getLatestVisitDatesByRecord(supabase: SupabaseClient, recordIds: string[]): Promise<Map<string, string>> {
  if (recordIds.length === 0) return new Map()
  const { data } = await supabase
    .from('territory_record_visits')
    .select('record_id, visited_at')
    .in('record_id', recordIds)
    .order('visited_at', { ascending: false })

  const latest = new Map<string, string>()
  for (const row of (data ?? []) as { record_id: string; visited_at: string }[]) {
    if (!latest.has(row.record_id)) latest.set(row.record_id, row.visited_at)
  }
  return latest
}

// Per-territory approved-record counts, for the New Assignment form's live "how many
// records would this pull in" hint next to each territory checkbox.
export async function getApprovedRecordCounts(
  supabase: SupabaseClient,
  congregationId: string
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('territory_records')
    .select('territory_id')
    .eq('congregation_id', congregationId)
    .eq('status', 'approved')

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as { territory_id: string }[]) {
    counts[row.territory_id] = (counts[row.territory_id] ?? 0) + 1
  }
  return counts
}

// Territories already claimed by ANY Group Leader's active batch today (congregation-wide,
// not scoped to one creator) — used to block a second Group Leader from double-assigning the
// same territory. Called after the caller's own prior batch for today (if regenerating) has
// already been deleted, so this never conflicts with itself.
//
// excludeCreatedBy: used by the overflow-assignment path (createAssignment's forceZeroRecords),
// where a Group Leader deliberately generates a SECOND same-day batch on a territory they
// themselves already cover — that's not a conflict, only a different Group Leader covering the
// same territory today still is.
async function getTerritoryIdsInUseToday(
  supabase: SupabaseClient,
  congregationId: string,
  assignmentDate: string,
  excludeCreatedBy?: string
): Promise<Set<string>> {
  let query = supabase
    .from('assignment_batches')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('assignment_date', assignmentDate)
  if (excludeCreatedBy) query = query.neq('created_by', excludeCreatedBy)
  const { data: batches } = await query
  const batchIds = (batches ?? []).map((b) => b.id as string)
  if (batchIds.length === 0) return new Set()

  const { data: links } = await supabase.from('assignment_batch_territories').select('territory_id').in('batch_id', batchIds)
  return new Set((links ?? []).map((l) => l.territory_id as string))
}

export interface CreateAssignmentResult {
  batchId: string
  unassignedCount: number
}

export async function createAssignment(
  supabase: SupabaseClient,
  congregationId: string,
  input: {
    territoryIds: string[]
    partnershipCount: number
    // How many approved records each partnership can get — the Group Leader's own suggestion for
    // this batch, falling back to calculateAssignment's own DEFAULT_MAX_PER_PARTNERSHIP when
    // omitted.
    maxPerPartnership?: number
    assignmentDate: string
    createdBy: string
    // Overflow-assignment path only (see createOverflowAssignmentAction): every partnership is
    // created with zero records regardless of what's technically still 'approved'/unassigned in
    // the territory — this is deliberately a "go canvass/search" batch, not a recompute, so it
    // never risks re-pulling a record another partnership already has open today. Also relaxes
    // the territory-conflict check below to allow reusing a territory THIS SAME Group Leader
    // already covers today (still blocks a different Group Leader's territory).
    forceZeroRecords?: boolean
  }
): Promise<CreateAssignmentResult | AssignmentError> {
  // The territory checkboxes are ordinary client-editable form values — confirm every
  // selected id actually belongs to this congregation before it's written into
  // assignment_batch_territories, same "don't trust a client-supplied parent id" rule as
  // territory/queries.ts's addSection/addBlock.
  const { data: ownedTerritories } = await supabase
    .from('territories')
    .select('id, name')
    .eq('congregation_id', congregationId)
    .in('id', input.territoryIds)
  const ownedById = new Map((ownedTerritories ?? []).map((t) => [t.id as string, t.name as string]))
  const territoryIds = input.territoryIds.filter((id) => ownedById.has(id))
  if (territoryIds.length === 0) return { error: 'Select at least one valid territory.' }

  // No two Group Leaders' active batches on the same day may cover the same territory —
  // confirmed with Russell: a hard block with a clear error, not a silent auto-filter. The
  // overflow path is this same Group Leader deliberately re-covering their own territory, so it
  // excludes their own batches from the conflict check.
  const inUseTerritoryIds = await getTerritoryIdsInUseToday(
    supabase,
    congregationId,
    input.assignmentDate,
    input.forceZeroRecords ? input.createdBy : undefined
  )
  const conflictingNames = territoryIds.filter((id) => inUseTerritoryIds.has(id)).map((id) => ownedById.get(id) ?? id)
  if (conflictingNames.length > 0) {
    const list = conflictingNames.join(', ')
    const verb = conflictingNames.length === 1 ? 'is' : 'are'
    return { error: `${list} ${verb} already assigned in another Group Leader's active batch today. Choose different territories.` }
  }

  const eligibleRecords = input.forceZeroRecords ? [] : await fetchEligibleRecordIds(supabase, congregationId, territoryIds)
  const plan = calculateAssignment(eligibleRecords, input.partnershipCount, input.maxPerPartnership)
  if (isAssignmentError(plan)) return plan

  const { data: batch, error: batchError } = await supabase
    .from('assignment_batches')
    .insert({
      congregation_id: congregationId,
      assignment_date: input.assignmentDate,
      requested_partnership_count: input.partnershipCount,
      created_by: input.createdBy,
      is_overflow: Boolean(input.forceZeroRecords),
    })
    .select('id')
    .single()
  if (batchError) return { error: batchError.message }
  const batchId = batch.id as string

  const { error: territoriesError } = await supabase.from('assignment_batch_territories').insert(
    territoryIds.map((territoryId) => ({ congregation_id: congregationId, batch_id: batchId, territory_id: territoryId }))
  )
  if (territoriesError) return { error: territoriesError.message }

  for (const partnershipPlan of plan.partnerships) {
    const { data: partnership, error: partnershipError } = await supabase
      .from('partnerships')
      .insert({
        congregation_id: congregationId,
        batch_id: batchId,
        sequence: partnershipPlan.sequence,
        name: `Ministry Partner ${partnershipPlan.sequence}`,
      })
      .select('id')
      .single()
    if (partnershipError) return { error: partnershipError.message }

    // A "searching a fresh territory" partnership has zero recordIds by design (see engine.ts)
    // — .insert([]) is a no-op worth skipping outright rather than trusting every Supabase
    // client version to handle an empty array insert gracefully.
    if (partnershipPlan.recordIds.length > 0) {
      const { error: recordsError } = await supabase.from('partnership_records').insert(
        partnershipPlan.recordIds.map((recordId, index) => ({
          congregation_id: congregationId,
          partnership_id: partnership.id,
          record_id: recordId,
          sequence: index + 1,
        }))
      )
      if (recordsError) return { error: recordsError.message }
    }
  }

  return { batchId, unassignedCount: plan.unassignedCount }
}

export async function deleteBatch(supabase: SupabaseClient, batchId: string): Promise<void> {
  const { error } = await supabase.from('assignment_batches').delete().eq('id', batchId)
  if (error) throw error
}

// A Group Leader can now have multiple batches per congregation per day (see
// 023_multiple_batches_per_group_leader.sql, which lifted the one-per-day unique constraint
// 013_group_leader_assignment_ownership.sql originally added) — e.g. their original batch plus
// one or more overflow batches generated for extra publishers later the same day. "Today's
// batches" means "my own batches today," not "the congregation's one shared batch." Ordered
// oldest-first so the original batch is always first in any switcher UI.
export async function getBatchesForGroupLeaderAndDate(
  supabase: SupabaseClient,
  congregationId: string,
  groupLeaderId: string,
  assignmentDate: string
): Promise<AssignmentBatch[]> {
  const { data } = await supabase
    .from('assignment_batches')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('assignment_date', assignmentDate)
    .eq('created_by', groupLeaderId)
    .order('created_at')
  return (data as AssignmentBatch[] | null) ?? []
}

// Shared by the admin Assignment Summary page, the public partnership-list page, and the
// public Progress page — all three need the same "batch + territories + per-partnership
// progress" shape.
export async function getBatchSummary(
  supabase: SupabaseClient,
  congregationId: string,
  batchId: string
): Promise<BatchSummary | null> {
  const { data: batch } = await supabase
    .from('assignment_batches')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('id', batchId)
    .maybeSingle()
  if (!batch) return null

  const [{ data: territoryLinks }, { data: partnerships }, { data: congregation }] = await Promise.all([
    supabase.from('assignment_batch_territories').select('territory:territories(id, name, description)').eq('batch_id', batchId),
    // Explicit column list, not select('*') — this feeds both the Admin dashboard and the
    // Group Leader's stats.partnerships (via getBatchStats), and admin_note/admin_note_at
    // must never reach the Group Leader surface (see 011_partnership_admin_note.sql).
    supabase
      .from('partnerships')
      .select('id, congregation_id, batch_id, sequence, name, claim_token, claimed_at, ended_early_at, finished_at, created_at')
      .eq('batch_id', batchId)
      .order('sequence'),
    supabase.from('congregations').select('timezone').eq('id', congregationId).maybeSingle(),
  ])

  // territory_id is a plain scalar column on the embedded record, not a relational embed — no
  // !territory_id disambiguation hint needed here (that's only required for an actual
  // `territories(...)`/`territory_sections(...)`/`territory_blocks(...)` join, see
  // RECORD_WITH_LOCATION_SELECT's comment). Used below to label each partnership's card with
  // which of the batch's territories its records actually fall in — a partnership's records can
  // span more than one territory when a territory's count isn't an exact multiple of
  // maxPerPartnership (see engine.ts's calculateAssignment, which slices the flat eligible-record
  // pool with no territory-boundary awareness).
  // section_id needs the !section_id disambiguation hint on its territory_sections embed —
  // territory_records has had multiple FKs to territory_sections since migration 030
  // (correction_recommended_section_id, then move_recommended_section_id in 033), so an
  // unqualified embed is ambiguous to PostgREST and silently returns zero rows (see 033's
  // comment for the full history of this failure mode).
  const partnershipIds = (partnerships ?? []).map((p) => p.id)
  const { data: allRecords } =
    partnershipIds.length > 0
      ? await supabase
          .from('partnership_records')
          .select(
            'partnership_id, record_id, completed_at, record:territory_records(plus_code, do_not_call, do_not_call_at, territory_id, section_id, section:territory_sections!section_id(id, label))'
          )
          .in('partnership_id', partnershipIds)
      : {
          data: [] as {
            partnership_id: string
            record_id: string
            completed_at: string | null
            record: {
              plus_code: string | null
              do_not_call: boolean
              do_not_call_at: string | null
              territory_id: string | null
              section_id: string | null
              section: { id: string; label: string } | null
            } | null
          }[],
        }

  // Latest visit result per record (newest-first, first occurrence wins — same de-dup pattern as
  // getVisitResultCounts/getReportStats) — used only to flag a partnership card with "a Bible
  // Study is in here somewhere," not for progress/completion math.
  const recordIdsForVisits = (allRecords ?? []).map((r) => r.record_id)
  const { data: visitRows } =
    recordIdsForVisits.length > 0
      ? await supabase
          .from('territory_record_visits')
          .select('record_id, result')
          .in('record_id', recordIdsForVisits)
          .order('visited_at', { ascending: false })
      : { data: [] as { record_id: string; result: string }[] }
  const latestResultByRecord = new Map<string, string>()
  for (const row of (visitRows ?? []) as { record_id: string; result: string }[]) {
    if (!latestResultByRecord.has(row.record_id)) latestResultByRecord.set(row.record_id, row.result)
  }

  // Batch-wide territory id -> {id, name, description} lookup — every record assigned to any
  // partnership in this batch necessarily belongs to one of these (fetchEligibleRecordIds only
  // ever pulls from the batch's own selected territoryIds), so this reuses the already-fetched
  // territoryLinks instead of a second query.
  const territoryById = new Map(
    ((territoryLinks ?? []) as unknown as { territory: { id: string; name: string; description: string } }[]).map((t) => [
      t.territory.id,
      t.territory,
    ])
  )

  const partnershipsWithProgress: PartnershipWithProgress[] = (partnerships ?? []).map((p) => {
    const records = (
      (allRecords ?? []) as unknown as {
        partnership_id: string
        record_id: string
        completed_at: string | null
        record: {
          plus_code: string | null
          do_not_call: boolean
          do_not_call_at: string | null
          territory_id: string | null
          section_id: string | null
          section: { id: string; label: string } | null
        } | null
      }[]
    ).filter((r) => r.partnership_id === p.id)

    // Distinct territories this partnership's own records fall in, in first-appearance order
    // (Map preserves insertion order) — usually just one, but see the comment above allRecords.
    const territoryIds = new Set<string>()
    const territories: { id: string; name: string; description: string }[] = []
    for (const r of records) {
      const territoryId = r.record?.territory_id
      if (!territoryId || territoryIds.has(territoryId)) continue
      territoryIds.add(territoryId)
      const territory = territoryById.get(territoryId)
      if (territory) territories.push(territory)
    }
    // Distinct sections this partnership's own records fall in — same first-appearance-order
    // pattern as territories above, but the section's own label is already embedded directly on
    // each record (no separate batch-wide lookup needed, unlike territoryById).
    const sectionIds = new Set<string>()
    const sections: { id: string; label: string }[] = []
    for (const r of records) {
      const section = r.record?.section
      if (!section || sectionIds.has(section.id)) continue
      sectionIds.add(section.id)
      sections.push(section)
    }
    // A record still locked under the Do Not Call cooldown can never be completed this session —
    // there's structurally no visit a publisher can log against it (see isDoNotCallLocked) — so
    // it's excluded from both sides of the count entirely, not just from blocking "done". Without
    // this, a partnership that finished everything actually reachable still read as "Done" next
    // to a contradictory "N remaining".
    const countable = records.filter((r) => !isDoNotCallLocked(r.record?.do_not_call ?? false, r.record?.do_not_call_at ?? null))

    // A household (multiple records sharing a Plus Code — see the "multi-record households"
    // feature) counts as ONE record toward "of N," matching the assignment engine keeping the
    // whole household in a single slot (see engine.ts). Grouped by Plus Code, falling back to
    // the record's own id (always a unique singleton) when it has none. A group counts as
    // completed once ANY member has a logged visit — confirmed with Russell: the publisher's
    // stop at that address is done once someone there has an outcome recorded, not only once
    // every resident individually does.
    const groups = new Map<string, typeof countable>()
    for (const r of countable) {
      const key = r.record?.plus_code || r.record_id
      const group = groups.get(key)
      if (group) group.push(r)
      else groups.set(key, [r])
    }

    // DNC count (household-grouped, same key as `groups` above but over every assigned record,
    // not just the countable ones — a locked DNC record is exactly the kind excluded from
    // `countable`, so this has to start from the full `records` list instead).
    const allGroups = new Map<string, typeof records>()
    for (const r of records) {
      const key = r.record?.plus_code || r.record_id
      const group = allGroups.get(key)
      if (group) group.push(r)
      else allGroups.set(key, [r])
    }
    const dncCount = Array.from(allGroups.values()).filter((group) => group.some((r) => r.record?.do_not_call)).length
    const hasBibleStudy = records.some((r) => {
      const result = latestResultByRecord.get(r.record_id)
      return result ? (BIBLE_STUDY_FAMILY_RESULTS as readonly string[]).includes(result) : false
    })

    return {
      ...(p as Partnership),
      recordCount: groups.size,
      completedCount: Array.from(groups.values()).filter((group) => group.some((r) => r.completed_at !== null)).length,
      territories,
      sections,
      dncCount,
      hasBibleStudy,
    }
  })

  return {
    ...(batch as AssignmentBatch),
    territories: ((territoryLinks ?? []) as unknown as { territory: { id: string; name: string; description: string } }[]).map((t) => t.territory),
    partnerships: partnershipsWithProgress,
    expired: isBatchExpired((batch as AssignmentBatch).assignment_date, congregation?.timezone ?? 'UTC'),
  }
}

export interface SearchScope {
  sectionId: string
  sectionLabel: string
  blocks: { id: string; label: string }[]
}

// The section/blocks THIS Ministry Partner locked in for their overflow search area (see
// 026_partnership_search_blocks.sql) — a one-time choice made after claiming, not the Group
// Leader's (that's what 025_overflow_search_scope.sql tried and Russell corrected: a batch-level
// choice can't enforce "no two pairs cover the same block," only a per-partnership one with a
// real DB constraint can). Null until chosen. Shared by getPartnershipByToken and the
// publisher's manual "Refresh" action, so both read the same live state.
export async function getSearchScopeForPartnership(supabase: SupabaseClient, partnershipId: string): Promise<SearchScope | null> {
  const { data } = await supabase
    .from('partnership_search_blocks')
    .select('section_id, section:territory_sections(label), block:territory_blocks(id, label)')
    .eq('partnership_id', partnershipId)
  const rows = (data ?? []) as unknown as { section_id: string; section: { label: string } | null; block: { id: string; label: string } | null }[]
  if (rows.length === 0) return null
  return {
    sectionId: rows[0].section_id,
    sectionLabel: rows[0].section?.label ?? '',
    blocks: rows.map((r) => r.block).filter((b): b is { id: string; label: string } => Boolean(b)),
  }
}

// Which OTHER partnership(s) currently have each of the given blocks locked for search today —
// blocks are shareable (037_partnership_search_blocks_shareable.sql), so more than one can hold
// the same block. Used to tell a publisher browsing "Existing Records in This Area" specifically
// who else is working that ground today, instead of a generic "the ministry partner currently
// working in this area." Excludes excludePartnershipId (the caller's own lock on its own scope)
// and any block with no other current searcher (simply absent from the returned map).
export async function getPartnersSearchingBlocks(
  supabase: SupabaseClient,
  congregationId: string,
  blockIds: string[],
  assignmentDate: string,
  excludePartnershipId: string
): Promise<Record<string, string[]>> {
  if (blockIds.length === 0) return {}
  const { data } = await supabase
    .from('partnership_search_blocks')
    .select('block_id, partnership:partnerships(id, name)')
    .eq('congregation_id', congregationId)
    .eq('assignment_date', assignmentDate)
    .in('block_id', blockIds)

  const result: Record<string, string[]> = {}
  for (const row of (data ?? []) as unknown as Array<{ block_id: string; partnership: { id: string; name: string } | null }>) {
    if (!row.partnership || row.partnership.id === excludePartnershipId) continue
    const list = result[row.block_id] ?? []
    list.push(row.partnership.name)
    result[row.block_id] = list
  }
  return result
}

export interface LockSearchBlocksResult {
  ok: boolean
  error?: string
}

// Locks in a partnership's one-time search-area choice — the caller (chooseSearchScopeAction)
// has already verified the section belongs to one of the batch's territories; this re-verifies
// every submitted block actually belongs to that section (never trusting the client) before
// inserting. Blocks are shareable — multiple partnerships can lock the same block on the same
// day (see 037_partnership_search_blocks_shareable.sql, which dropped the old
// unique(block_id, assignment_date) constraint) — only the section is a one-time, single choice
// per partnership.
export async function lockPartnershipSearchBlocks(
  supabase: SupabaseClient,
  congregationId: string,
  partnershipId: string,
  sectionId: string,
  blockIds: string[],
  assignmentDate: string
): Promise<LockSearchBlocksResult> {
  const { data: blocks } = await supabase.from('territory_blocks').select('id').eq('section_id', sectionId).in('id', blockIds)
  const validBlockIds = (blocks ?? []).map((b) => b.id as string)
  if (validBlockIds.length === 0) return { ok: false, error: 'Choose at least one valid block.' }

  const { error } = await supabase.from('partnership_search_blocks').insert(
    validBlockIds.map((blockId) => ({
      congregation_id: congregationId,
      partnership_id: partnershipId,
      section_id: sectionId,
      block_id: blockId,
      assignment_date: assignmentDate,
    }))
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Resolves a batch by its raw id — used by movePartnershipRecordAction to check whether a
// pass's destination batch belongs to the same Group Leader/day as the source, without pulling
// in the full BatchSummary (territories/partnerships/stats) this doesn't need.
export async function getBatchById(supabase: SupabaseClient, batchId: string): Promise<AssignmentBatch | null> {
  const { data } = await supabase.from('assignment_batches').select('*').eq('id', batchId).maybeSingle()
  return (data as AssignmentBatch | null) ?? null
}

// Public entry point: resolves a batch by its QR/URL token. No congregation auth involved —
// the unguessable token itself is the access control for this one public-facing slice.
export async function getBatchByToken(supabase: SupabaseClient, accessToken: string): Promise<BatchSummary | null> {
  const { data: batch } = await supabase.from('assignment_batches').select('*').eq('access_token', accessToken).maybeSingle()
  if (!batch) return null
  return getBatchSummary(supabase, batch.congregation_id, batch.id)
}

// Public entry point: resolves a partnership by its claim token and returns everything its
// workspace page needs. Does NOT stamp claimed_at — claiming happens explicitly when the
// publisher saves their name via renamePartnership below, not merely by opening the link, so
// the assigned-records list can stay hidden behind a "who are you" step until then.
export async function getPartnershipByToken(supabase: SupabaseClient, claimToken: string): Promise<PartnershipWorkspace | null> {
  const { data: partnership } = await supabase.from('partnerships').select('*').eq('claim_token', claimToken).maybeSingle()
  if (!partnership) return null

  const { data: batch } = await supabase.from('assignment_batches').select('*').eq('id', partnership.batch_id).maybeSingle()
  if (!batch) return null

  const { data: congregation } = await supabase.from('congregations').select('name, timezone').eq('id', partnership.congregation_id).maybeSingle()
  const expired = isBatchExpired(batch.assignment_date, congregation?.timezone ?? 'UTC')

  const { data: partnershipRecords } = await supabase
    .from('partnership_records')
    .select(
      // !territory_id/!section_id/!block_id required — same ambiguous-embed hazard as
      // fetchEligibleRecordIds above (territory_records has had two/three/four FKs to each of
      // territories/territory_sections/territory_blocks since migrations 030/033/034); without
      // the hint this silently returned every publisher's assigned records as an empty list.
      'id, sequence, completed_at, passed_from_name, passed_from_at, record:territory_records(*, territory:territories!territory_id(id, name, description, map_image_url), section:territory_sections!section_id(id, label), block:territory_blocks!block_id(id, label), correction_territory:territories!correction_recommended_territory_id(id, name, description), correction_section:territory_sections!correction_recommended_section_id(id, label), correction_block:territory_blocks!correction_recommended_block_id(id, label), move_territory:territories!move_recommended_territory_id(id, name, description), move_section:territory_sections!move_recommended_section_id(id, label), move_block:territory_blocks!move_recommended_block_id(id, label))'
    )
    .eq('partnership_id', partnership.id)
    .order('sequence')

  const records = (partnershipRecords ?? []) as unknown as PartnershipRecordDetail[]

  // Fetched up front, once, and attached per-record — the client shell renders visit history
  // entirely from this initial payload, no on-demand server call once the page has loaded.
  if (records.length > 0) {
    const { data: visitRows } = await supabase
      .from('territory_record_visits')
      .select('*, creator:profiles(full_name)')
      .in(
        'record_id',
        records.map((r) => r.record.id)
      )
      .order('visited_at', { ascending: false })
    const visitsByRecord = new Map<string, PartnershipRecordDetail['visits']>()
    for (const row of (visitRows ?? []) as unknown as Array<Record<string, unknown> & { record_id: string; creator: { full_name: string } | null }>) {
      const list = visitsByRecord.get(row.record_id) ?? []
      list.push({ ...(row as unknown as PartnershipRecordDetail['visits'][number]), created_by_name: row.creator?.full_name ?? null })
      visitsByRecord.set(row.record_id, list)
    }
    for (const r of records) {
      r.visits = visitsByRecord.get(r.record.id) ?? []
    }
  }

  // The whole BATCH's selected territories, not just the ones with an assigned record — a
  // zero-record ("searching a fresh territory") partnership has no records to derive a
  // territory from at all, which used to leave both "Add a New Contact Record" and the
  // Territory Map(s) section with nothing to show for a batch that's entirely about searching
  // one specific territory.
  const { data: batchTerritoryLinks } = await supabase
    .from('assignment_batch_territories')
    .select('territory:territories(id, name, description, map_image_url)')
    .eq('batch_id', partnership.batch_id)
  const territories = ((batchTerritoryLinks ?? []) as unknown as { territory: { id: string; name: string; description: string; map_image_url: string | null } | null }[])
    .map((l) => l.territory)
    .filter((t): t is { id: string; name: string; description: string; map_image_url: string | null } => t !== null)

  const siblingPartnerships = await getGroupLeaderPartnershipsForDate(supabase, batch as AssignmentBatch, partnership.id)
  const addedRecords = await listRecordsAddedByPartnership(supabase, partnership.id)
  const searchScope = await getSearchScopeForPartnership(supabase, partnership.id)
  const searchScopeRecords = searchScope
    ? await getRecordsInBlocks(supabase, partnership.congregation_id, searchScope.blocks.map((b) => b.id))
    : []
  const searchScopeBlockPartners = searchScope
    ? await getPartnersSearchingBlocks(
        supabase,
        partnership.congregation_id,
        searchScope.blocks.map((b) => b.id),
        batch.assignment_date,
        partnership.id
      )
    : {}
  // Same data the pre-claim batch-landing page shows (see getBatchByToken) — fetched here too
  // so the workspace's own "All Partners" tab can render it from the initial load, offline and
  // all, instead of navigating back to that server-rendered page.
  const batchSummary = await getBatchSummary(supabase, partnership.congregation_id, partnership.batch_id)
  const batchPartnerships = batchSummary?.partnerships ?? []
  const congregationAnchor = await getCongregationPlusCodeAnchor(supabase, partnership.congregation_id)
  const incomingRequests = await listIncomingRecordTransferRequests(supabase, partnership.id)

  return {
    ...(partnership as Partnership),
    batch: batch as AssignmentBatch,
    congregationName: congregation?.name ?? '',
    timezone: congregation?.timezone ?? 'UTC',
    records,
    territories,
    expired,
    siblingPartnerships,
    addedRecords,
    searchScope,
    searchScopeRecords,
    searchScopeBlockPartners,
    batchPartnerships,
    incomingRequests,
    congregationAnchor,
  }
}

// Other partnerships in the same batch a record can be moved to — excludes the partnership
// itself and any that already ended their ministry early (nothing left to hand a record to).
// Superseded as the default sibling source by getGroupLeaderPartnershipsForDate below (which
// spans every batch the same Group Leader owns today, not just this one) — kept as the
// fallback for legacy batches with no created_by to group by.
export async function getBatchSiblingPartnerships(
  supabase: SupabaseClient,
  batchId: string,
  excludePartnershipId: string
): Promise<{ id: string; name: string }[]> {
  const { data } = await supabase
    .from('partnerships')
    .select('id, name, ended_early_at, finished_at')
    .eq('batch_id', batchId)
    .neq('id', excludePartnershipId)
    .order('sequence')
  // Excludes anyone who's already ended their ministry for the day, whether early
  // (ended_early_at) or by finishing normally (finished_at) — there's no one left on that side
  // to actually receive and act on a passed record.
  return ((data ?? []) as { id: string; name: string; ended_early_at: string | null; finished_at: string | null }[])
    .filter((p) => !p.ended_early_at && !p.finished_at)
    .map((p) => ({ id: p.id, name: p.name }))
}

// Same label logic as GroupLeaderTabs.tsx's batchLabel() — kept in sync deliberately (both
// derive "Assignment"/"Overflow"/"Overflow 2"... from is_overflow + oldest-first order) so a
// partnership's sibling list and the Group Leader's own batch switcher never disagree about
// what a given batch is called.
function batchLabelFor(batches: AssignmentBatch[], batchId: string): string {
  let overflowSeen = 0
  for (const b of batches) {
    if (!b.is_overflow) {
      if (b.id === batchId) return 'Assignment'
      continue
    }
    overflowSeen += 1
    if (b.id === batchId) return overflowSeen === 1 ? 'Overflow' : `Overflow ${overflowSeen}`
  }
  return 'Assignment'
}

// Every other Ministry Partner working under the SAME Group Leader TODAY, across every batch
// they own (original assignment + any overflow batches) — not just the caller's own batch.
// Confirmed with Russell: overflow partners are meant to be reachable for a pass too (they're
// working nearby, not in a separate silo). Falls back to same-batch-only siblings for a legacy
// batch with created_by = null, since there's no safe way to group "unowned" batches together.
export async function getGroupLeaderPartnershipsForDate(
  supabase: SupabaseClient,
  batch: AssignmentBatch,
  excludePartnershipId: string
): Promise<{ id: string; name: string; batchLabel: string }[]> {
  if (!batch.created_by) {
    const legacy = await getBatchSiblingPartnerships(supabase, batch.id, excludePartnershipId)
    return legacy.map((p) => ({ ...p, batchLabel: 'Assignment' }))
  }

  const batches = await getBatchesForGroupLeaderAndDate(supabase, batch.congregation_id, batch.created_by, batch.assignment_date)
  const batchIds = batches.map((b) => b.id)
  if (batchIds.length === 0) return []

  const { data } = await supabase
    .from('partnerships')
    .select('id, name, batch_id, ended_early_at, finished_at')
    .in('batch_id', batchIds)
    .neq('id', excludePartnershipId)
    .order('sequence')

  return ((data ?? []) as { id: string; name: string; batch_id: string; ended_early_at: string | null; finished_at: string | null }[])
    .filter((p) => !p.ended_early_at && !p.finished_at)
    .map((p) => ({ id: p.id, name: p.name, batchLabel: batchLabelFor(batches, p.batch_id) }))
}

// Resolves a partnership by its raw id (not claim_token) — used to validate a move's
// destination, which the publisher picks from getBatchSiblingPartnerships' list rather than
// ever having that partnership's own token.
export async function getPartnershipById(supabase: SupabaseClient, partnershipId: string): Promise<Partnership | null> {
  const { data } = await supabase.from('partnerships').select('*').eq('id', partnershipId).maybeSingle()
  return (data as Partnership | null) ?? null
}

export interface PartnershipAssignedRecordSummary {
  id: string
  residentName: string
  address: string
  plusCode: string | null
}

// Read-only name list for the Group Leader's Partners tab accordion (see PartnershipList.tsx) —
// deliberately minimal (no visit status/history, no Admin-only fields), just enough for a Group
// Leader to see exactly who's assigned to a given partner without navigating away. Grouping by
// Plus Code (same address = same household, i.e. "linked contacts") is left to the caller — this
// just returns the flat list in assignment order.
export async function getPartnershipAssignedRecordSummaries(
  supabase: SupabaseClient,
  partnershipId: string
): Promise<PartnershipAssignedRecordSummary[]> {
  const { data } = await supabase
    .from('partnership_records')
    .select('record:territory_records(id, resident_name, address, plus_code)')
    .eq('partnership_id', partnershipId)
    .order('sequence')
  return (
    (data ?? []) as unknown as Array<{ record: { id: string; resident_name: string; address: string; plus_code: string | null } | null }>
  )
    .map((r) => r.record)
    .filter((r): r is { id: string; resident_name: string; address: string; plus_code: string | null } => r !== null)
    .map((r) => ({ id: r.id, residentName: r.resident_name, address: r.address, plusCode: r.plus_code }))
}

// The first successful rename *is* the claim (see getPartnershipByToken's comment above) — a
// later rename (e.g. a typo fix) shouldn't re-stamp claimed_at, so that only happens the one
// time this conditional update actually matches a still-unclaimed row.
export async function renamePartnership(supabase: SupabaseClient, partnershipId: string, name: string): Promise<void> {
  const { data: claimedRow, error: claimError } = await supabase
    .from('partnerships')
    .update({ name, claimed_at: new Date().toISOString() })
    .eq('id', partnershipId)
    .is('claimed_at', null)
    .select('id')
    .maybeSingle()
  if (claimError) throw claimError
  if (claimedRow) return

  const { error } = await supabase.from('partnerships').update({ name }).eq('id', partnershipId)
  if (error) throw error
}

// "Release" — a change of mind, not ending the ministry. Resets the partnership back to its
// pristine unclaimed state (null claimed_at, name back to the auto-generated default) so it
// shows up as available again on the batch landing page for anyone (including a different
// device) to claim. Deliberately distinct from terminatePartnershipEarly: that marks a real
// day's work as cut short; this undoes a claim that never became real work in the first place —
// releasePartnershipAction only allows it while zero records have been visited.
export async function releasePartnership(supabase: SupabaseClient, partnershipId: string, sequence: number): Promise<void> {
  const { error } = await supabase
    .from('partnerships')
    .update({ claimed_at: null, name: `Ministry Partner ${sequence}` })
    .eq('id', partnershipId)
  if (error) throw error
}

// Ends a Ministry Partner's session early. Deliberately does NOT touch any unfinished record —
// no visit logged, completed_at left null — so the Group Leader's existing "Remaining Contact
// Records" stat (a live count, not a snapshot) already reflects exactly how many were left
// undone today, and each record's real last-visited date stays untouched, which is what
// fetchEligibleRecordIds' staleness tiebreak relies on to put a record left undone today at the
// front of the list next generation. A previous version of this logged a synthetic 'undone'
// visit and force-completed these records — that both corrupted the staleness signal (an
// untouched record looked freshly visited) and could mask an ongoing Bible Study's true latest
// status.
export async function terminatePartnershipEarly(supabase: SupabaseClient, partnershipId: string): Promise<void> {
  const { error } = await supabase
    .from('partnerships')
    .update({ ended_early_at: new Date().toISOString() })
    .eq('id', partnershipId)
    .is('ended_early_at', null)
  if (error) throw error
}

// The "we're genuinely done" signal, set the moment a publisher reaches Sync & Finish (Skip or
// Send on the note screen) — reachable from BOTH the normal finish path and the End Early path,
// since both route through that same note screen. Distinct from ended_early_at (only set by
// terminatePartnershipEarly above, meaning some assigned records were left incomplete for the day); this fires
// regardless of which path got them there. Idempotent — a second call is a harmless no-op.
export async function finishPartnership(supabase: SupabaseClient, partnershipId: string): Promise<void> {
  const { error } = await supabase
    .from('partnerships')
    .update({ finished_at: new Date().toISOString() })
    .eq('id', partnershipId)
    .is('finished_at', null)
  if (error) throw error
}

// End-of-ministry note to the Admin — skippable, so this is only ever called when a publisher
// actually writes something. Visible to the Admin only (see listPartnershipNotesForCongregation
// below); the Group Leader has no read path to this column anywhere in the app.
export async function submitPartnershipNote(supabase: SupabaseClient, partnershipId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('partnerships')
    .update({ admin_note: note, admin_note_at: new Date().toISOString() })
    .eq('id', partnershipId)
  if (error) throw error
}

export interface PartnershipNote {
  id: string
  name: string
  admin_note: string
  admin_note_at: string
  assignment_date: string
}

// The quick-note alternative to the full Add Record / Recommend New Location forms — see
// 040_publisher_quick_notes.sql. Unlike admin_note (one per partnership), a partnership can send
// any number of these.
export async function addPartnershipQuickNote(
  supabase: SupabaseClient,
  partnershipId: string,
  congregationId: string,
  fields: { name: string; phone: string; notes: string }
): Promise<void> {
  const { error } = await supabase.from('partnership_quick_notes').insert({
    congregation_id: congregationId,
    partnership_id: partnershipId,
    name: fields.name,
    phone: fields.phone || null,
    notes: fields.notes,
  })
  if (error) throw error
}

export interface PartnershipQuickNote {
  id: string
  partnershipName: string
  name: string
  phone: string | null
  notes: string
  created_at: string
  assignment_date: string
}

// Admin-only read of every quick note sent across all of this congregation's batches (not
// scoped to today) — same reasoning as listPartnershipNotesForCongregation above. Merged with
// that list on the Notes page itself rather than here, since the two carry different shapes.
export async function listPartnershipQuickNotesForCongregation(
  supabase: SupabaseClient,
  congregationId: string
): Promise<PartnershipQuickNote[]> {
  const { data } = await supabase
    .from('partnership_quick_notes')
    .select('id, name, phone, notes, created_at, partnership:partnerships(name, batch:assignment_batches(assignment_date))')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
  return (
    (data ?? []) as unknown as Array<{
      id: string
      name: string
      phone: string | null
      notes: string
      created_at: string
      partnership: { name: string; batch: { assignment_date: string } | null } | null
    }>
  ).map((row) => ({
    id: row.id,
    partnershipName: row.partnership?.name ?? '',
    name: row.name,
    phone: row.phone,
    notes: row.notes,
    created_at: row.created_at,
    assignment_date: row.partnership?.batch?.assignment_date ?? '',
  }))
}

// Admin-only read of every submitted end-of-ministry note across all of this congregation's
// batches (not scoped to today) — a note from last week is still worth an admin seeing it.
export async function listPartnershipNotesForCongregation(supabase: SupabaseClient, congregationId: string): Promise<PartnershipNote[]> {
  const { data } = await supabase
    .from('partnerships')
    .select('id, name, admin_note, admin_note_at, batch:assignment_batches(assignment_date)')
    .eq('congregation_id', congregationId)
    .not('admin_note', 'is', null)
    .order('admin_note_at', { ascending: false })
  return ((data ?? []) as unknown as Array<{ id: string; name: string; admin_note: string; admin_note_at: string; batch: { assignment_date: string } | null }>).map(
    (row) => ({
      id: row.id,
      name: row.name,
      admin_note: row.admin_note,
      admin_note_at: row.admin_note_at,
      assignment_date: row.batch?.assignment_date ?? '',
    })
  )
}

// Guard used before any publisher-facing record mutation — the concrete enforcement of
// "publishers cannot edit records belonging to other partnerships."
export async function partnershipHasRecord(supabase: SupabaseClient, partnershipId: string, recordId: string): Promise<boolean> {
  const { data } = await supabase
    .from('partnership_records')
    .select('id')
    .eq('partnership_id', partnershipId)
    .eq('record_id', recordId)
    .maybeSingle()
  return !!data
}

// Only stamps completed_at the first time — later visits to an already-completed record
// (e.g. a follow-up Return Visit) don't reset "when this partnership finished it."
export async function markPartnershipRecordCompleted(supabase: SupabaseClient, partnershipId: string, recordId: string): Promise<void> {
  const { error } = await supabase
    .from('partnership_records')
    .update({ completed_at: new Date().toISOString() })
    .eq('partnership_id', partnershipId)
    .eq('record_id', recordId)
    .is('completed_at', null)
  if (error) throw error
}

// Passes an assigned record to a different partnership in the same batch — an UPDATE on the
// existing partnership_records row (preserving its id), not a delete+reinsert. Re-sequenced to
// the end of the destination's list and completed_at reset to null: only incomplete records are
// ever offered for a move (see the publisher UI), but this stays defensive either way, since the
// destination partnership hasn't actually visited it yet regardless of the source's state.
export async function movePartnershipRecord(
  supabase: SupabaseClient,
  sourcePartnershipId: string,
  destinationPartnershipId: string,
  recordId: string,
  sourcePartnershipName: string
): Promise<void> {
  const { data: lastRow } = await supabase
    .from('partnership_records')
    .select('sequence')
    .eq('partnership_id', destinationPartnershipId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSequence = ((lastRow?.sequence as number | undefined) ?? 0) + 1

  // passed_from_name/passed_from_at (022_partnership_pass_tracking.sql) are a snapshot of the
  // source partnership's name at move time, not a live reference — a plain column pair rather
  // than a territory_record_visits row, since logVisit()'s same-day collapse and
  // getLatestVisitResult()'s "latest row wins" narrowing would otherwise risk overwriting a real
  // visit or masking an active Bible Study's true status for the receiving partner.
  const { error } = await supabase
    .from('partnership_records')
    .update({
      partnership_id: destinationPartnershipId,
      sequence: nextSequence,
      completed_at: null,
      passed_from_name: sourcePartnershipName || null,
      passed_from_at: new Date().toISOString(),
    })
    .eq('partnership_id', sourcePartnershipId)
    .eq('record_id', recordId)
  if (error) throw error
}

// Admin-facing read of the current "passed by" marker for a record, if any — sourced from the
// same passed_from_name/at columns the publisher badge uses, not from visit history (see
// movePartnershipRecord above). Only ever set on a record's currently-active partnership_records
// row, so a plain lookup by record_id is enough; a record with no assignment history at all, or
// never passed, returns null.
export async function getPassedFromForRecord(
  supabase: SupabaseClient,
  recordId: string
): Promise<{ name: string; at: string } | null> {
  const { data } = await supabase
    .from('partnership_records')
    .select('passed_from_name, passed_from_at')
    .eq('record_id', recordId)
    .not('passed_from_name', 'is', null)
    .order('passed_from_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as { passed_from_name: string | null; passed_from_at: string | null }
  return row.passed_from_name && row.passed_from_at ? { name: row.passed_from_name, at: row.passed_from_at } : null
}

// Backs the publisher workspace's Search tab — congregation-wide across every one of today's
// batches (House To House + every Auxiliary/overflow one), scoped to the territories those
// batches actually cover (never the whole congregation's all-time record database). See
// 042_record_transfer_requests.sql for the feature this powers.
export async function searchTodaysAssignedRecords(
  supabase: SupabaseClient,
  congregationId: string,
  assignmentDate: string,
  query: string
): Promise<RecordSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const { data: batches } = await supabase
    .from('assignment_batches')
    .select('id')
    .eq('congregation_id', congregationId)
    .eq('assignment_date', assignmentDate)
  const batchIds = (batches ?? []).map((b) => b.id as string)
  if (batchIds.length === 0) return []

  const { data: territoryLinks } = await supabase.from('assignment_batch_territories').select('territory_id').in('batch_id', batchIds)
  const territoryIds = [...new Set((territoryLinks ?? []).map((l) => l.territory_id as string))]
  if (territoryIds.length === 0) return []

  // Escape PostgREST's ilike wildcards so a query containing a literal % or _ doesn't behave
  // like a wildcard itself.
  const escaped = trimmed.replace(/[%_]/g, (c) => `\\${c}`)
  const { data: records } = await supabase
    .from('territory_records')
    .select('id, resident_name, address, plus_code, territory:territories!territory_id(name, description)')
    .in('territory_id', territoryIds)
    .or(`resident_name.ilike.%${escaped}%,address.ilike.%${escaped}%,plus_code.ilike.%${escaped}%`)
    .limit(30)
  const matched = (records ?? []) as unknown as Array<{
    id: string
    resident_name: string
    address: string
    plus_code: string | null
    territory: { name: string; description: string } | null
  }>
  if (matched.length === 0) return []

  // Two plain follow-up queries (not an embedded/inner-join filter) — simpler to reason about
  // and avoids relying on PostgREST's nested-filter syntax working exactly as expected. Fine at
  // this scale (at most 30 matched records, at most a handful of partnerships today).
  const { data: prRows } = await supabase
    .from('partnership_records')
    .select('record_id, partnership_id')
    .in(
      'record_id',
      matched.map((m) => m.id)
    )
  const partnershipIdByRecordId = new Map((prRows ?? []).map((r) => [r.record_id as string, r.partnership_id as string]))
  const partnershipIds = [...new Set(partnershipIdByRecordId.values())]

  const partnershipInfoById = new Map<string, { name: string; isOverflow: boolean }>()
  if (partnershipIds.length > 0) {
    const { data: partnershipRows } = await supabase.from('partnerships').select('id, name, batch_id').in('id', partnershipIds)
    const todaysBatchIds = new Set(batchIds)
    const relevant = (partnershipRows ?? []).filter((p) => todaysBatchIds.has(p.batch_id as string))
    if (relevant.length > 0) {
      const relevantBatchIds = [...new Set(relevant.map((p) => p.batch_id as string))]
      const { data: batchRows } = await supabase.from('assignment_batches').select('id, is_overflow').in('id', relevantBatchIds)
      const isOverflowByBatchId = new Map((batchRows ?? []).map((b) => [b.id as string, b.is_overflow as boolean]))
      for (const p of relevant) {
        partnershipInfoById.set(p.id as string, { name: p.name as string, isOverflow: isOverflowByBatchId.get(p.batch_id as string) ?? false })
      }
    }
  }

  return matched.map((m) => {
    const partnershipId = partnershipIdByRecordId.get(m.id)
    const info = partnershipId ? partnershipInfoById.get(partnershipId) : undefined
    return {
      id: m.id,
      residentName: m.resident_name,
      address: m.address,
      plusCode: m.plus_code,
      territoryName: m.territory?.description || m.territory?.name || '',
      assignedTo: partnershipId && info ? { partnershipId, partnershipName: info.name, isOverflow: info.isOverflow } : null,
    }
  })
}

// A Search-tab result with no current holder can be claimed instantly, no approval needed —
// there's no one to ask. Just a normal partnership_records insert (same mechanism as a regular
// assignment), so every existing dashboard/stat that already reads from that table picks up the
// new assignment automatically, no separate wiring needed. Re-verifies the record is still
// actually unassigned server-side (never trusts the client's search-result snapshot, which could
// be stale by the time they tap the button).
export async function claimUnassignedRecord(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string,
  partnershipId: string
): Promise<RecordTransferRequestError | { ok: true }> {
  const { data: existing } = await supabase.from('partnership_records').select('id').eq('record_id', recordId).maybeSingle()
  if (existing) return { error: 'This record was just claimed by someone else — try refreshing your search.' }

  const { data: lastRow } = await supabase
    .from('partnership_records')
    .select('sequence')
    .eq('partnership_id', partnershipId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSequence = ((lastRow?.sequence as number | undefined) ?? 0) + 1

  const { error } = await supabase
    .from('partnership_records')
    .insert({ congregation_id: congregationId, partnership_id: partnershipId, record_id: recordId, sequence: nextSequence })
  if (error) throw error
  return { ok: true }
}

// Creates a pending request (see 042_record_transfer_requests.sql) — the requesting partnership
// asks the current holder for a record instead of an instant "Pass." Re-verifies the current
// holder server-side rather than trusting a client-supplied holdingPartnershipId, and enforces
// the cross-group rule: an Auxiliary/overflow partnership can never request a record currently
// held by a House To House (non-overflow) one.
export async function createRecordTransferRequest(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string,
  requestingPartnershipId: string,
  requestingIsOverflow: boolean
): Promise<RecordTransferRequestError | { ok: true }> {
  const { data: prRow } = await supabase.from('partnership_records').select('partnership_id').eq('record_id', recordId).maybeSingle()
  const holdingPartnershipId = prRow?.partnership_id as string | undefined
  if (!holdingPartnershipId) return { error: 'This record is no longer assigned to anyone today.' }
  if (holdingPartnershipId === requestingPartnershipId) return { error: 'This record is already assigned to you.' }

  const { data: holdingPartnership } = await supabase.from('partnerships').select('batch_id').eq('id', holdingPartnershipId).maybeSingle()
  if (!holdingPartnership) return { error: 'This record is no longer assigned to anyone today.' }
  const { data: holdingBatch } = await supabase.from('assignment_batches').select('is_overflow').eq('id', holdingPartnership.batch_id).maybeSingle()
  const holdingIsOverflow = Boolean(holdingBatch?.is_overflow)

  if (requestingIsOverflow && !holdingIsOverflow) {
    return { error: 'Auxiliary Groups cannot request records assigned to House To House.' }
  }

  const { error } = await supabase.from('record_transfer_requests').insert({
    congregation_id: congregationId,
    record_id: recordId,
    requesting_partnership_id: requestingPartnershipId,
    holding_partnership_id: holdingPartnershipId,
  })
  // A duplicate still-pending request for the same record/requester hits the partial unique
  // index — treat it as a harmless no-op (the request is already in) rather than an error.
  if (error && error.code !== '23505') throw error
  return { ok: true }
}

// Pending requests for records THIS partnership currently holds — surfaced on the Search tab so
// the holder can approve or decline. Re-fetched manually (see the Search tab's own Refresh), same
// "plain read, not queued through the offline sync system" pattern as getSearchScopeRecordsAction.
export async function listIncomingRecordTransferRequests(
  supabase: SupabaseClient,
  holdingPartnershipId: string
): Promise<IncomingRecordTransferRequest[]> {
  const { data } = await supabase
    .from('record_transfer_requests')
    .select(
      'id, created_at, record:territory_records(id, resident_name, address), requesting:partnerships!requesting_partnership_id(name)'
    )
    .eq('holding_partnership_id', holdingPartnershipId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (
    (data ?? []) as unknown as Array<{
      id: string
      created_at: string
      record: { id: string; resident_name: string; address: string } | null
      requesting: { name: string } | null
    }>
  )
    .filter((r) => r.record !== null)
    .map((r) => ({
      id: r.id,
      recordId: r.record!.id,
      residentName: r.record!.resident_name,
      address: r.record!.address,
      requestingPartnershipName: r.requesting?.name ?? 'Unnamed partnership',
      createdAt: r.created_at,
    }))
}

// Approves or declines an incoming request. Re-verifies the record is still actually held by
// holdingPartnershipId before approving — if it was passed/re-assigned elsewhere in the meantime,
// this fails gracefully rather than moving a record out from under whoever actually has it now.
export async function resolveRecordTransferRequest(
  supabase: SupabaseClient,
  requestId: string,
  holdingPartnershipId: string,
  decision: 'approved' | 'declined',
  holdingPartnershipName: string
): Promise<RecordTransferRequestError | { ok: true }> {
  const { data: request } = await supabase
    .from('record_transfer_requests')
    .select('record_id, requesting_partnership_id, status')
    .eq('id', requestId)
    .eq('holding_partnership_id', holdingPartnershipId)
    .maybeSingle()
  if (!request || request.status !== 'pending') return { error: 'This request is no longer pending.' }

  if (decision === 'approved') {
    const { data: prRow } = await supabase.from('partnership_records').select('partnership_id').eq('record_id', request.record_id).maybeSingle()
    if (!prRow || prRow.partnership_id !== holdingPartnershipId) {
      return { error: 'This record is no longer assigned to you — the request can no longer be approved.' }
    }
    await movePartnershipRecord(supabase, holdingPartnershipId, request.requesting_partnership_id, request.record_id, holdingPartnershipName)
  }

  const { error } = await supabase
    .from('record_transfer_requests')
    .update({ status: decision, resolved_at: new Date().toISOString() })
    .eq('id', requestId)
  if (error) throw error
  return { ok: true }
}
