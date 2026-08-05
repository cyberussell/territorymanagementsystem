import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { OpenLocationCode } from 'open-location-code'
import { formatPlusCode, formatProperCase } from './format'
import { buildEditSummary } from './history'
import type {
  RecordHistoryAction,
  RecordHistoryEntry,
  RecordStatus,
  RecordVisitWithAuthor,
  TerritoryRecord,
  TerritoryRecordWithLocation,
} from './types'

// Who performed a record mutation, for the change-history log below — a plain-text name
// snapshot (Admin's full_name, or a partnership's name), never a live join. Optional on every
// write function that accepts it: omitting it (the publisher's assigned-record visit-logging
// path, admin approve/pending-status toggles, etc.) simply skips logging, same as
// addedByAdminId/editedByAdminId already do for the separate admin-audit-note columns.
interface HistoryActor {
  role: 'admin' | 'publisher'
  name: string
}

const openLocationCode = new OpenLocationCode()

// The !territory_id/!section_id/!block_id hints are required, not cosmetic: migrations 030, 033,
// and 034 gave territory_records a second, third, and fourth FK to territories/territory_sections/
// territory_blocks (the correction_recommended_*/move_recommended_* columns below), so an
// unqualified `territories(...)`/`territory_sections(...)`/`territory_blocks(...)` embed is
// ambiguous to PostgREST and the whole query silently returns zero rows instead of erroring —
// every embed of these three tables needs a hint, not just the newer correction_*/move_* ones
// (this exact failure mode already happened once from 030, see
// territory-management-ambiguous-fk-embed-fix-v1).
const RECORD_WITH_LOCATION_SELECT =
  '*, territory:territories!territory_id(id, name, description), section:territory_sections!section_id(id, label), block:territory_blocks!block_id(id, label), ' +
  'correction_section:territory_sections!correction_recommended_section_id(id, label), ' +
  'correction_block:territory_blocks!correction_recommended_block_id(id, label), ' +
  'correction_territory:territories!correction_recommended_territory_id(id, name, description), ' +
  'move_territory:territories!move_recommended_territory_id(id, name, description), ' +
  'move_section:territory_sections!move_recommended_section_id(id, label), ' +
  'move_block:territory_blocks!move_recommended_block_id(id, label), ' +
  'added_by_profile:profiles!admin_added_by(full_name), ' +
  'edited_by_profile:profiles!admin_edited_by(full_name)'

export async function listRecords(
  supabase: SupabaseClient,
  congregationId: string,
  territoryId?: string
): Promise<TerritoryRecordWithLocation[]> {
  let query = supabase
    .from('territory_records')
    .select(RECORD_WITH_LOCATION_SELECT)
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
  if (territoryId) query = query.eq('territory_id', territoryId)
  const { data } = await query
  return (data ?? []) as unknown as TerritoryRecordWithLocation[]
}

// Every record currently in a given set of blocks — used by an overflow batch's optional search
// scope (see 025_overflow_search_scope.sql) to show a publisher whatever already exists in the
// area they're about to canvass, read-only, so they don't create a duplicate for a household
// someone already logged. Deliberately unfiltered by status (a still-'pending' record is just as
// real a duplicate risk as an 'approved' one).
export async function getRecordsInBlocks(supabase: SupabaseClient, congregationId: string, blockIds: string[]): Promise<TerritoryRecordWithLocation[]> {
  if (blockIds.length === 0) return []
  const { data } = await supabase
    .from('territory_records')
    .select(RECORD_WITH_LOCATION_SELECT)
    .eq('congregation_id', congregationId)
    .in('block_id', blockIds)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as TerritoryRecordWithLocation[]
}

// One full-form (unshortened) Plus Code anywhere in the congregation, decoded to a lat/lng —
// used purely as a geographic reference point so HouseholdDistributionMap can recover a
// short/local-form code (the realistic common case for one typed manually at the door, rather
// than captured via "Use My Location") even when the specific record set being viewed has no
// full code of its own to anchor against — e.g. a Ministry Partner's search area with a single
// freshly-added record and nothing else nearby yet. Bounded to a couple hundred rows rather than
// every approved record congregation-wide (contrast getApprovedRecordLocations, which the much
// less frequently loaded Admin Reports map fetches in full) — cheap enough to run on every
// publisher workspace page load, and virtually certain to find at least one GPS-captured code in
// any congregation that's used that button even once. Unfiltered by status — an anchor point
// doesn't need to be an approved record, it's never itself rendered as a pin.
export async function getCongregationPlusCodeAnchor(
  supabase: SupabaseClient,
  congregationId: string
): Promise<{ lat: number; lng: number } | null> {
  const { data } = await supabase
    .from('territory_records')
    .select('plus_code')
    .eq('congregation_id', congregationId)
    .not('plus_code', 'is', null)
    .limit(200)

  for (const row of (data ?? []) as { plus_code: string | null }[]) {
    if (!row.plus_code || !openLocationCode.isValid(row.plus_code) || !openLocationCode.isFull(row.plus_code)) continue
    try {
      const area = openLocationCode.decode(row.plus_code)
      return { lat: area.latitudeCenter, lng: area.longitudeCenter }
    } catch {
      // Passed isValid/isFull but still failed to decode — keep looking rather than give up.
      continue
    }
  }
  return null
}

export async function getRecordById(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string
): Promise<TerritoryRecordWithLocation | null> {
  const { data } = await supabase
    .from('territory_records')
    .select(RECORD_WITH_LOCATION_SELECT)
    .eq('congregation_id', congregationId)
    .eq('id', recordId)
    .maybeSingle()
  return (data as unknown as TerritoryRecordWithLocation) ?? null
}

// Logs one entry to a record's change history — distinct from logVisit's territory_record_visits
// (field-ministry visit results). Called from every write function below that accepts a
// HistoryActor. Retention is 1 year (vs. visits' 6 months) — same opportunistic
// delete-on-every-write pattern as logVisit's own retention cleanup, just a longer window since
// this is a lower-volume, more consequential audit trail.
export async function logRecordHistory(
  supabase: SupabaseClient,
  congregationId: string,
  input: { recordId: string; action: RecordHistoryAction; summary: string; actor: HistoryActor }
): Promise<void> {
  const { error } = await supabase.from('territory_record_history').insert({
    congregation_id: congregationId,
    record_id: input.recordId,
    action: input.action,
    summary: input.summary,
    actor_role: input.actor.role,
    actor_name: input.actor.name,
  })
  if (error) throw error

  const oneYearAgo = new Date()
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1)
  await supabase.from('territory_record_history').delete().eq('congregation_id', congregationId).lt('created_at', oneYearAgo.toISOString())
}

export async function listRecordHistory(supabase: SupabaseClient, recordId: string): Promise<RecordHistoryEntry[]> {
  const { data } = await supabase
    .from('territory_record_history')
    .select('*')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as RecordHistoryEntry[]
}

// Resolves Territory/Section/Block ids to their display labels — used by the applyRecordCorrection/
// applyRecordMove change-history summaries below so a diff reads "Barangay: Old Name → New Name"
// instead of two raw uuids. Plain lookups, not embeds — same "don't nest through a table with
// more than one FK to the same target" rule this codebase applies everywhere else (see
// RECORD_WITH_LOCATION_SELECT's own comment).
async function resolveLocationLabels(
  supabase: SupabaseClient,
  territoryIds: string[],
  sectionIds: string[],
  blockIds: string[]
): Promise<{ territories: Map<string, string>; sections: Map<string, string>; blocks: Map<string, string> }> {
  const uniqueTerritoryIds = Array.from(new Set(territoryIds))
  const uniqueSectionIds = Array.from(new Set(sectionIds))
  const uniqueBlockIds = Array.from(new Set(blockIds))
  const [territoriesRes, sectionsRes, blocksRes] = await Promise.all([
    uniqueTerritoryIds.length ? supabase.from('territories').select('id, name').in('id', uniqueTerritoryIds) : Promise.resolve({ data: [] }),
    uniqueSectionIds.length ? supabase.from('territory_sections').select('id, label').in('id', uniqueSectionIds) : Promise.resolve({ data: [] }),
    uniqueBlockIds.length ? supabase.from('territory_blocks').select('id, label').in('id', uniqueBlockIds) : Promise.resolve({ data: [] }),
  ])
  return {
    territories: new Map(((territoriesRes.data ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])),
    sections: new Map(((sectionsRes.data ?? []) as { id: string; label: string }[]).map((s) => [s.id, s.label])),
    blocks: new Map(((blocksRes.data ?? []) as { id: string; label: string }[]).map((b) => [b.id, b.label])),
  }
}

export async function createRecord(
  supabase: SupabaseClient,
  congregationId: string,
  input: {
    // Set by addPublisherRecordAction to the same id it optimistically rendered client-side
    // the moment the publisher submitted — lets the offline-first UI show (and immediately
    // allow editing/deleting) a just-added record before the write has even synced, since the
    // id is already known and stable. Admin/CSV-import paths omit this and get the column's
    // normal gen_random_uuid() default.
    id?: string
    territoryId: string
    sectionId: string
    blockId: string
    address: string
    unit: string
    residentName: string
    plusCode: string
    householdMembers?: number
    notes: string
    doNotCall: boolean
    status?: RecordStatus
    source?: TerritoryRecord['source']
    createdByPartnershipId?: string
    // Set only by the Admin's own createRecordAction — stamps who added this record and when,
    // shown as a small audit note on the record detail page. Left unset for publisher-added
    // and CSV-imported records (no Admin actually typed those in).
    addedByAdminId?: string
    // Logs a 'created' change-history entry when provided — CSV import omits this (bulk,
    // low-signal-per-row), everything else that adds a single record passes it.
    historyActor?: HistoryActor
  }
): Promise<TerritoryRecord> {
  const { data, error } = await supabase
    .from('territory_records')
    .insert({
      ...(input.id ? { id: input.id } : {}),
      congregation_id: congregationId,
      territory_id: input.territoryId,
      section_id: input.sectionId,
      block_id: input.blockId,
      address: formatProperCase(input.address),
      unit: input.unit,
      resident_name: formatProperCase(input.residentName),
      plus_code: formatPlusCode(input.plusCode) || null,
      household_members: input.householdMembers ?? null,
      notes: input.notes,
      do_not_call: input.doNotCall,
      status: input.status ?? 'approved',
      source: input.source ?? 'manual',
      created_by_partnership_id: input.createdByPartnershipId ?? null,
      ...(input.addedByAdminId ? { admin_added_by: input.addedByAdminId, admin_added_at: new Date().toISOString() } : {}),
    })
    .select('*')
    .single()
  if (error) throw error
  const record = data as TerritoryRecord
  if (input.historyActor) {
    await logRecordHistory(supabase, congregationId, {
      recordId: record.id,
      action: 'created',
      summary: 'Added this contact record.',
      actor: input.historyActor,
    })
  }
  return record
}

export async function updateRecord(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string,
  updates: {
    // Only set by the publisher's own "edit a record I added" path — every other caller
    // (admin edit, "Mark as Moved" → Update Contact Record) leaves the record's location alone.
    territoryId?: string
    sectionId?: string
    blockId?: string
    address: string
    unit: string
    residentName: string
    plusCode: string
    householdMembers?: number
    notes: string
    doNotCall: boolean
    // Set only by the Admin's own updateRecordAction — stamps who last edited this record and
    // when, shown as a small audit note on the record detail page. Left unset for publisher
    // edits (own added-record edit, "Update Contact Record" after a Move).
    editedByAdminId?: string
    // Logs an 'edited' change-history entry (with a before/after diff) when provided, but only
    // if something actually changed — a Save click that changed nothing logs no entry.
    historyActor?: HistoryActor
  }
): Promise<void> {
  const formattedAddress = formatProperCase(updates.address)
  const formattedResidentName = formatProperCase(updates.residentName)
  const formattedPlusCode = formatPlusCode(updates.plusCode) || null
  const householdMembers = updates.householdMembers ?? null

  type EditSnapshot = {
    address: string
    unit: string
    resident_name: string
    plus_code: string | null
    household_members: number | null
    do_not_call: boolean
    notes: string
  }
  let before: EditSnapshot | null = null
  if (updates.historyActor) {
    const { data } = await supabase
      .from('territory_records')
      .select('address, unit, resident_name, plus_code, household_members, do_not_call, notes')
      .eq('id', recordId)
      .maybeSingle()
    before = data as EditSnapshot | null
  }

  const { error } = await supabase
    .from('territory_records')
    .update({
      ...(updates.territoryId ? { territory_id: updates.territoryId } : {}),
      ...(updates.sectionId ? { section_id: updates.sectionId } : {}),
      ...(updates.blockId ? { block_id: updates.blockId } : {}),
      address: formattedAddress,
      unit: updates.unit,
      resident_name: formattedResidentName,
      plus_code: formattedPlusCode,
      household_members: householdMembers,
      notes: updates.notes,
      do_not_call: updates.doNotCall,
      updated_at: new Date().toISOString(),
      ...(updates.editedByAdminId ? { admin_edited_by: updates.editedByAdminId, admin_edited_at: new Date().toISOString() } : {}),
    })
    .eq('id', recordId)
  if (error) throw error

  if (updates.historyActor && before) {
    const summary = buildEditSummary(
      {
        address: before.address,
        unit: before.unit,
        residentName: before.resident_name,
        plusCode: before.plus_code ?? '',
        householdMembers: before.household_members,
        doNotCall: before.do_not_call,
        notes: before.notes,
      },
      {
        address: formattedAddress,
        unit: updates.unit,
        residentName: formattedResidentName,
        plusCode: formattedPlusCode ?? '',
        householdMembers,
        doNotCall: updates.doNotCall,
        notes: updates.notes,
      }
    )
    if (summary) {
      await logRecordHistory(supabase, congregationId, { recordId, action: 'edited', summary, actor: updates.historyActor })
    }
  }
}

export async function deleteRecord(supabase: SupabaseClient, recordId: string): Promise<void> {
  const { error } = await supabase.from('territory_records').delete().eq('id', recordId)
  if (error) throw error
}

// The publisher's own "My Added Records" list — records this specific partnership added via
// the workspace's Add form, regardless of their (still Admin-controlled) pending/approved
// status. Deliberately not scoped through partnership_records — these records are never
// linked there (see addPublisherRecordAction).
export async function listRecordsAddedByPartnership(
  supabase: SupabaseClient,
  partnershipId: string
): Promise<TerritoryRecordWithLocation[]> {
  const { data } = await supabase
    .from('territory_records')
    .select(RECORD_WITH_LOCATION_SELECT)
    .eq('created_by_partnership_id', partnershipId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as TerritoryRecordWithLocation[]
}

// Guard used before the publisher-facing edit/delete-added-record actions — the concrete
// enforcement of "a publisher may only edit/delete records they personally added," mirroring
// partnershipHasRecord's role for assigned records. source='publisher' is belt-and-suspenders:
// created_by_partnership_id is never set on any other source.
export async function recordAddedByPartnership(supabase: SupabaseClient, partnershipId: string, recordId: string): Promise<boolean> {
  const { data } = await supabase
    .from('territory_records')
    .select('id')
    .eq('id', recordId)
    .eq('created_by_partnership_id', partnershipId)
    .eq('source', 'publisher')
    .maybeSingle()
  return !!data
}

export async function setRecordStatus(supabase: SupabaseClient, recordId: string, status: RecordStatus): Promise<void> {
  const { error } = await supabase.from('territory_records').update({ status }).eq('id', recordId)
  if (error) throw error
}

// Publisher-facing "Mark as Moved" → "Recommend for Admin Removal" path — the reason is
// required at the schema level (assignment/schema.ts), never optional. Logged verbatim to
// change-history at recommend time (not just onto removal_recommended_reason) since dismissing
// the recommendation clears that column — history is the only place the reason survives that.
export async function recommendRecordForRemoval(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string,
  reason: string,
  recommendedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('territory_records')
    .update({ removal_recommended_at: new Date().toISOString(), removal_recommended_reason: reason, removal_recommended_by: recommendedBy })
    .eq('id', recordId)
  if (error) throw error
  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'removal_recommended',
    summary: `Recommended removal: "${reason}"`,
    actor: { role: 'publisher', name: recommendedBy },
  })
}

// Admin dismisses a removal recommendation without deleting the record (e.g. it turned out to
// be a mistake) — clears the flag so it drops off the Flagged for Removal list.
export async function dismissRemovalRecommendation(supabase: SupabaseClient, congregationId: string, recordId: string, actorName: string): Promise<void> {
  const { data: existing } = await supabase.from('territory_records').select('removal_recommended_reason').eq('id', recordId).maybeSingle()
  const { error } = await supabase
    .from('territory_records')
    .update({ removal_recommended_at: null, removal_recommended_reason: null, removal_recommended_by: null })
    .eq('id', recordId)
  if (error) throw error
  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'removal_dismissed',
    summary: existing?.removal_recommended_reason
      ? `Dismissed the removal recommendation: "${existing.removal_recommended_reason}"`
      : 'Dismissed the removal recommendation.',
    actor: { role: 'admin', name: actorName },
  })
}

export async function listFlaggedForRemoval(supabase: SupabaseClient, congregationId: string): Promise<TerritoryRecordWithLocation[]> {
  const { data } = await supabase
    .from('territory_records')
    .select(RECORD_WITH_LOCATION_SELECT)
    .eq('congregation_id', congregationId)
    .not('removal_recommended_at', 'is', null)
    .order('removal_recommended_at', { ascending: false })
  return (data ?? []) as unknown as TerritoryRecordWithLocation[]
}

// Publisher-facing "Update" path — recommends a corrected Plus Code (the most common wrong-data
// case) plus a reason, without editing the record directly. Overwrites any prior
// recommendation on this record rather than accumulating a history — same "latest wins" shape
// as recommendRecordForRemoval above.
// Confirms a publisher-submitted Section/Block correction actually belongs to the record's own
// territory before it's ever written — never trust a client-supplied parent id outright, same
// rule this codebase applies everywhere else a client picks from a constrained list (e.g.
// createAssignment's territory check, lockPartnershipSearchBlocks' block check). Two plain
// queries rather than a nested embed — territory_records/territory_sections/territory_blocks
// each only have one relevant FK path here, but a nested embed was exactly what broke silently
// elsewhere in this product once a table gained a second FK, so this stays deliberately simple.
export async function sectionBlockBelongsToTerritory(
  supabase: SupabaseClient,
  territoryId: string,
  sectionId: string,
  blockId: string
): Promise<boolean> {
  const { data: section } = await supabase
    .from('territory_sections')
    .select('id')
    .eq('id', sectionId)
    .eq('territory_id', territoryId)
    .maybeSingle()
  if (!section) return false
  const { data: block } = await supabase.from('territory_blocks').select('id').eq('id', blockId).eq('section_id', sectionId).maybeSingle()
  return !!block
}

// Same idea as sectionBlockBelongsToTerritory above, but for the Move recommendation flow —
// unlike Correction (where territoryId is always the record's own, server-derived, never client-
// supplied), a Move recommendation lets the publisher pick a *different* territory/barangay
// entirely, so territoryId itself is client input here and needs its own ownership check before
// trusting it — same "don't trust a client-supplied parent id" rule, just one level up.
export async function territorySectionBlockBelongsToCongregation(
  supabase: SupabaseClient,
  congregationId: string,
  territoryId: string,
  sectionId: string,
  blockId: string
): Promise<boolean> {
  const { data: territory } = await supabase
    .from('territories')
    .select('id')
    .eq('id', territoryId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (!territory) return false
  return sectionBlockBelongsToTerritory(supabase, territoryId, sectionId, blockId)
}

// territoryId added alongside sectionId/blockId (034_correction_recommendation_territory.sql) —
// a record can be filed under the wrong barangay entirely, not just the wrong Section/Block
// within the right one. Object param (not positional) specifically so this addition couldn't
// silently reorder either of the two call sites' existing positional args.
export async function recommendRecordCorrection(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string,
  fields: {
    plusCode: string
    reason: string
    territoryId: string
    sectionId: string
    blockId: string
    // Optional — see 031_correction_household_members.sql. undefined means "not recommending a
    // change to this field," left out of the update entirely rather than written as null, so a
    // second correction that only touches the Plus Code can't accidentally wipe out a still-open
    // household-members recommendation from create time (this function always fires on submit,
    // there's only ever one recommendation in flight per record at a time, so this mostly guards
    // against a caller forgetting to pass it rather than a real concurrent-edit scenario).
    householdMembers?: number
    // Optional — see 041_correction_resident_name.sql. Same "undefined means no change
    // recommended" reasoning as householdMembers above.
    residentName?: string
  },
  recommendedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('territory_records')
    .update({
      correction_recommended_at: new Date().toISOString(),
      correction_recommended_plus_code: formatPlusCode(fields.plusCode),
      correction_recommended_reason: fields.reason,
      correction_recommended_by: recommendedBy,
      correction_recommended_territory_id: fields.territoryId,
      correction_recommended_section_id: fields.sectionId,
      correction_recommended_block_id: fields.blockId,
      correction_recommended_household_members: fields.householdMembers ?? null,
      correction_recommended_resident_name: fields.residentName ? formatProperCase(fields.residentName) : null,
    })
    .eq('id', recordId)
  if (error) throw error
  // Logged verbatim to change-history at recommend time — dismissing or applying the
  // recommendation both clear correction_recommended_reason, so history is the only place the
  // publisher's reason survives either outcome.
  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'correction_recommended',
    summary: `Recommended a correction: "${fields.reason}"`,
    actor: { role: 'publisher', name: recommendedBy },
  })
}

// Admin dismisses a correction recommendation without applying it (e.g. it turned out to be
// wrong) — clears the flag, leaves the record's own plus_code untouched.
export async function dismissCorrectionRecommendation(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string,
  actorName: string
): Promise<void> {
  const { data: existing } = await supabase.from('territory_records').select('correction_recommended_reason').eq('id', recordId).maybeSingle()
  const { error } = await supabase
    .from('territory_records')
    .update({
      correction_recommended_at: null,
      correction_recommended_plus_code: null,
      correction_recommended_reason: null,
      correction_recommended_by: null,
      correction_recommended_territory_id: null,
      correction_recommended_section_id: null,
      correction_recommended_block_id: null,
      correction_recommended_household_members: null,
      correction_recommended_resident_name: null,
    })
    .eq('id', recordId)
  if (error) throw error
  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'correction_dismissed',
    summary: existing?.correction_recommended_reason
      ? `Dismissed the correction recommendation: "${existing.correction_recommended_reason}"`
      : 'Dismissed the correction recommendation.',
    actor: { role: 'admin', name: actorName },
  })
}

// Admin applies a correction recommendation — writes the recommended Plus Code/Territory/
// Section/Block/Household Members onto the record's real columns and clears the recommendation
// flag in the same update. Reads the recommended values first since Supabase's update() can't
// copy one column's value into another server-side without a raw SQL/RPC call. Also reads the
// record's CURRENT values for the same fields (not just the recommended ones) so the
// change-history entry can show a real before/after diff instead of just "applied."
export async function applyRecordCorrection(supabase: SupabaseClient, congregationId: string, recordId: string, actorName: string): Promise<void> {
  const { data: existing } = await supabase
    .from('territory_records')
    .select(
      'plus_code, territory_id, section_id, block_id, household_members, resident_name, correction_recommended_plus_code, correction_recommended_territory_id, correction_recommended_section_id, correction_recommended_block_id, correction_recommended_household_members, correction_recommended_resident_name'
    )
    .eq('id', recordId)
    .maybeSingle()
  if (
    !existing?.correction_recommended_plus_code &&
    !existing?.correction_recommended_territory_id &&
    !existing?.correction_recommended_section_id &&
    !existing?.correction_recommended_block_id &&
    existing?.correction_recommended_household_members == null &&
    !existing?.correction_recommended_resident_name
  ) {
    return
  }
  const update: Record<string, unknown> = {
    correction_recommended_at: null,
    correction_recommended_plus_code: null,
    correction_recommended_reason: null,
    correction_recommended_by: null,
    correction_recommended_territory_id: null,
    correction_recommended_section_id: null,
    correction_recommended_block_id: null,
    correction_recommended_household_members: null,
    correction_recommended_resident_name: null,
    updated_at: new Date().toISOString(),
  }
  if (existing.correction_recommended_plus_code) update.plus_code = existing.correction_recommended_plus_code
  if (existing.correction_recommended_territory_id) update.territory_id = existing.correction_recommended_territory_id
  if (existing.correction_recommended_section_id) update.section_id = existing.correction_recommended_section_id
  if (existing.correction_recommended_block_id) update.block_id = existing.correction_recommended_block_id
  if (existing.correction_recommended_household_members != null) update.household_members = existing.correction_recommended_household_members
  if (existing.correction_recommended_resident_name) update.resident_name = existing.correction_recommended_resident_name
  const { error } = await supabase.from('territory_records').update(update).eq('id', recordId)
  if (error) throw error

  const labels = await resolveLocationLabels(
    supabase,
    [existing.territory_id, existing.correction_recommended_territory_id].filter((v): v is string => !!v),
    [existing.section_id, existing.correction_recommended_section_id].filter((v): v is string => !!v),
    [existing.block_id, existing.correction_recommended_block_id].filter((v): v is string => !!v)
  )
  const parts: string[] = []
  if (existing.correction_recommended_plus_code && existing.correction_recommended_plus_code !== existing.plus_code) {
    parts.push(`Plus Code: ${existing.plus_code ?? '(blank)'} → ${existing.correction_recommended_plus_code}`)
  }
  if (existing.correction_recommended_territory_id && existing.correction_recommended_territory_id !== existing.territory_id) {
    parts.push(
      `Barangay: ${labels.territories.get(existing.territory_id) ?? '?'} → ${labels.territories.get(existing.correction_recommended_territory_id) ?? '?'}`
    )
  }
  if (existing.correction_recommended_section_id && existing.correction_recommended_section_id !== existing.section_id) {
    parts.push(
      `Section: ${labels.sections.get(existing.section_id) ?? '?'} → ${labels.sections.get(existing.correction_recommended_section_id) ?? '?'}`
    )
  }
  if (existing.correction_recommended_block_id && existing.correction_recommended_block_id !== existing.block_id) {
    parts.push(`Block: ${labels.blocks.get(existing.block_id) ?? '?'} → ${labels.blocks.get(existing.correction_recommended_block_id) ?? '?'}`)
  }
  if (existing.correction_recommended_household_members != null && existing.correction_recommended_household_members !== existing.household_members) {
    parts.push(`Household members: ${existing.household_members ?? '(blank)'} → ${existing.correction_recommended_household_members}`)
  }
  if (existing.correction_recommended_resident_name && existing.correction_recommended_resident_name !== existing.resident_name) {
    parts.push(`Resident name: ${existing.resident_name || '(blank)'} → ${existing.correction_recommended_resident_name}`)
  }

  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'correction_applied',
    summary: parts.length > 0 ? `Applied correction — ${parts.join('; ')}` : 'Applied the recommended correction.',
    actor: { role: 'admin', name: actorName },
  })
}

export async function listFlaggedForCorrection(supabase: SupabaseClient, congregationId: string): Promise<TerritoryRecordWithLocation[]> {
  const { data } = await supabase
    .from('territory_records')
    .select(RECORD_WITH_LOCATION_SELECT)
    .eq('congregation_id', congregationId)
    .not('correction_recommended_at', 'is', null)
    .order('correction_recommended_at', { ascending: false })
  return (data ?? []) as unknown as TerritoryRecordWithLocation[]
}

// Publisher-facing "Unlocated" -> "Suggest New Location" path — the current resident at this
// address knows where the person who used to live here moved to. Same review-gated shape as
// recommendRecordForRemoval/recommendRecordCorrection above: nothing on the real record changes
// until the Admin applies it. resident_name is deliberately never touched here — same person,
// just a new location. No more Plus Code/Territory/Section/Block — the record stays put in its
// own territory/section/block; applyRecordMove leaves plus_code and unit as-is since this path
// never collects a new one for either.
export async function recommendRecordMove(
  supabase: SupabaseClient,
  congregationId: string,
  recordId: string,
  fields: {
    address: string
    householdMembers?: number
    notes: string
  },
  recommendedBy: string
): Promise<void> {
  const { error } = await supabase
    .from('territory_records')
    .update({
      move_recommended_at: new Date().toISOString(),
      move_recommended_address: formatProperCase(fields.address),
      move_recommended_unit: null,
      move_recommended_plus_code: null,
      move_recommended_household_members: fields.householdMembers ?? null,
      move_recommended_notes: fields.notes,
      move_recommended_by: recommendedBy,
      move_recommended_territory_id: null,
      move_recommended_section_id: null,
      move_recommended_block_id: null,
    })
    .eq('id', recordId)
  if (error) throw error
  // Logged verbatim to change-history at recommend time — dismissing or applying the
  // recommendation both clear move_recommended_notes, so history is the only place the
  // publisher's note survives either outcome.
  const trimmedNotes = fields.notes.trim()
  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'move_recommended',
    summary: trimmedNotes ? `Recommended a new location: "${trimmedNotes}"` : 'Recommended a new location.',
    actor: { role: 'publisher', name: recommendedBy },
  })
}

// Admin dismisses a move recommendation without applying it — clears the flag, leaves the
// record's own address/unit/plus_code/household_members/territory/section/block untouched.
export async function dismissMoveRecommendation(supabase: SupabaseClient, congregationId: string, recordId: string, actorName: string): Promise<void> {
  const { data: existing } = await supabase.from('territory_records').select('move_recommended_notes').eq('id', recordId).maybeSingle()
  const { error } = await supabase
    .from('territory_records')
    .update({
      move_recommended_at: null,
      move_recommended_address: null,
      move_recommended_unit: null,
      move_recommended_plus_code: null,
      move_recommended_household_members: null,
      move_recommended_notes: null,
      move_recommended_by: null,
      move_recommended_territory_id: null,
      move_recommended_section_id: null,
      move_recommended_block_id: null,
    })
    .eq('id', recordId)
  if (error) throw error
  const trimmedNotes = existing?.move_recommended_notes?.trim()
  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'move_dismissed',
    summary: trimmedNotes ? `Dismissed the move recommendation: "${trimmedNotes}"` : 'Dismissed the move recommendation.',
    actor: { role: 'admin', name: actorName },
  })
}

// Admin applies a move recommendation — writes the recommended address/unit/plus_code/household
// members/territory/section/block onto the record's real columns (resident_name untouched, same
// as the recommendation itself never carrying one) and clears the recommendation flag in the
// same update. Territory/Section/Block always travel together (the form always submits a full
// location, never a partial one), so they're applied unconditionally alongside address/unit —
// unlike Correction's applyRecordCorrection, there's no "only touch what was recommended" partial
// case here.
export async function applyRecordMove(supabase: SupabaseClient, congregationId: string, recordId: string, actorName: string): Promise<void> {
  const { data: existing } = await supabase
    .from('territory_records')
    .select(
      'address, unit, plus_code, household_members, territory_id, section_id, block_id, move_recommended_address, move_recommended_unit, move_recommended_plus_code, move_recommended_household_members, move_recommended_territory_id, move_recommended_section_id, move_recommended_block_id'
    )
    .eq('id', recordId)
    .maybeSingle()
  if (!existing?.move_recommended_address) return
  const update: Record<string, unknown> = {
    move_recommended_at: null,
    move_recommended_address: null,
    move_recommended_unit: null,
    move_recommended_plus_code: null,
    move_recommended_household_members: null,
    move_recommended_notes: null,
    move_recommended_by: null,
    move_recommended_territory_id: null,
    move_recommended_section_id: null,
    move_recommended_block_id: null,
    address: existing.move_recommended_address,
    // Suggest New Location no longer collects a Unit or Plus Code — preserve whatever the record
    // already had instead of wiping it, since move_recommended_unit/plus_code will now always be
    // null (only kept in the recommended_* columns for old, pre-redesign recommendations, if any
    // are still in flight).
    unit: existing.move_recommended_unit ?? existing.unit ?? '',
    plus_code: existing.move_recommended_plus_code ?? existing.plus_code,
    updated_at: new Date().toISOString(),
  }
  if (existing.move_recommended_household_members != null) update.household_members = existing.move_recommended_household_members
  if (existing.move_recommended_territory_id) update.territory_id = existing.move_recommended_territory_id
  if (existing.move_recommended_section_id) update.section_id = existing.move_recommended_section_id
  if (existing.move_recommended_block_id) update.block_id = existing.move_recommended_block_id
  const { error } = await supabase.from('territory_records').update(update).eq('id', recordId)
  if (error) throw error

  const labels = await resolveLocationLabels(
    supabase,
    [existing.territory_id, existing.move_recommended_territory_id].filter((v): v is string => !!v),
    [existing.section_id, existing.move_recommended_section_id].filter((v): v is string => !!v),
    [existing.block_id, existing.move_recommended_block_id].filter((v): v is string => !!v)
  )
  const parts: string[] = [`Address: ${existing.address || '(blank)'} → ${existing.move_recommended_address}`]
  if ((existing.move_recommended_unit ?? '') !== existing.unit) {
    parts.push(`Unit: ${existing.unit || '(blank)'} → ${existing.move_recommended_unit || '(blank)'}`)
  }
  if (existing.move_recommended_plus_code && existing.move_recommended_plus_code !== existing.plus_code) {
    parts.push(`Plus Code: ${existing.plus_code ?? '(blank)'} → ${existing.move_recommended_plus_code}`)
  }
  if (existing.move_recommended_household_members != null && existing.move_recommended_household_members !== existing.household_members) {
    parts.push(`Household members: ${existing.household_members ?? '(blank)'} → ${existing.move_recommended_household_members}`)
  }
  if (existing.move_recommended_territory_id && existing.move_recommended_territory_id !== existing.territory_id) {
    parts.push(`Barangay: ${labels.territories.get(existing.territory_id) ?? '?'} → ${labels.territories.get(existing.move_recommended_territory_id) ?? '?'}`)
  }
  if (existing.move_recommended_section_id && existing.move_recommended_section_id !== existing.section_id) {
    parts.push(`Section: ${labels.sections.get(existing.section_id) ?? '?'} → ${labels.sections.get(existing.move_recommended_section_id) ?? '?'}`)
  }
  if (existing.move_recommended_block_id && existing.move_recommended_block_id !== existing.block_id) {
    parts.push(`Block: ${labels.blocks.get(existing.block_id) ?? '?'} → ${labels.blocks.get(existing.move_recommended_block_id) ?? '?'}`)
  }

  await logRecordHistory(supabase, congregationId, {
    recordId,
    action: 'move_applied',
    summary: `Applied move — ${parts.join('; ')}`,
    actor: { role: 'admin', name: actorName },
  })
}

export async function listFlaggedForMove(supabase: SupabaseClient, congregationId: string): Promise<TerritoryRecordWithLocation[]> {
  const { data } = await supabase
    .from('territory_records')
    .select(RECORD_WITH_LOCATION_SELECT)
    .eq('congregation_id', congregationId)
    .not('move_recommended_at', 'is', null)
    .order('move_recommended_at', { ascending: false })
  return (data ?? []) as unknown as TerritoryRecordWithLocation[]
}

// Admin-only "Undo Last Visit" — deletes the single most recent visit entry so the record
// reverts to whatever its status was before (e.g. a mis-tagged Bible Study). Since logVisit
// keeps only one row per calendar day (same-day edits overwrite in place), the latest row by
// visited_at is always exactly "the last thing logged," so a plain delete is safe here — no
// risk of leaving a same-day duplicate behind.
export async function deleteLatestVisit(supabase: SupabaseClient, recordId: string): Promise<void> {
  const { data: latest } = await supabase
    .from('territory_record_visits')
    .select('id')
    .eq('record_id', recordId)
    .order('visited_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!latest) return
  const { error } = await supabase.from('territory_record_visits').delete().eq('id', (latest as { id: string }).id)
  if (error) throw error
}

// Admin corrects the result/notes a publisher actually submitted, in place — distinct from
// deleteLatestVisit (removes it outright) and from just logging a fresh visit today (only
// collapses into the existing row if it's the same calendar day; an older mistaken entry needs
// fixing in place instead). visited_at/created_by/partner_name are left untouched so the visit
// still reads as "submitted by X on Y," just with corrected result/notes and a new
// overridden_by_admin_at marker (migration 029) for Visit History to show "Overridden by admin."
// Deliberately does NOT touch the record's own do_not_call flag even if the new result is/was
// 'do_not_call' — that's a separate, explicit toggle on RecordEditForm with its own 6-month-lock
// trigger; auto-flipping it here as a side effect of a notes/status correction would be a
// surprising, easy-to-miss consequence.
export async function overrideLatestVisit(supabase: SupabaseClient, recordId: string, result: string, notes: string): Promise<void> {
  const { data: latest } = await supabase
    .from('territory_record_visits')
    .select('id')
    .eq('record_id', recordId)
    .order('visited_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!latest) throw new Error('No visit to override.')
  const { error } = await supabase
    .from('territory_record_visits')
    .update({ result, notes, overridden_by_admin_at: new Date().toISOString() })
    .eq('id', (latest as { id: string }).id)
  if (error) throw error
}

interface ImportRow {
  territoryId: string
  sectionId: string
  blockId: string
  address: string
  unit: string
  residentName: string
  plusCode: string
  householdMembers: number | null
  notes: string
  doNotCall: boolean
}

// CSV-imported rows land as 'pending' so the admin reviews them before they count as live
// territory data — matches the same 'pending' state a future publisher-facing submission
// flow can also feed without a schema change. territoryId lives per-row (not a shared param)
// since the cross-territory import resolves a different territory for each row from its own
// Territory Name column; the per-territory import just sets the same id on every row.
export async function importRecords(supabase: SupabaseClient, congregationId: string, rows: ImportRow[]): Promise<number> {
  if (rows.length === 0) return 0
  const { error } = await supabase.from('territory_records').insert(
    rows.map((r) => ({
      congregation_id: congregationId,
      territory_id: r.territoryId,
      section_id: r.sectionId,
      block_id: r.blockId,
      address: formatProperCase(r.address),
      unit: r.unit,
      resident_name: formatProperCase(r.residentName),
      plus_code: formatPlusCode(r.plusCode) || null,
      household_members: r.householdMembers,
      notes: r.notes,
      do_not_call: r.doNotCall,
      status: 'pending',
      source: 'csv_import',
    }))
  )
  if (error) throw error
  return rows.length
}

// Cheap variant of listVisits for callers that only need the most recent result (e.g. to
// re-derive getSelectableResults() server-side) — no need to pull full history + the
// profiles join for that.
export async function getLatestVisitResult(supabase: SupabaseClient, recordId: string): Promise<string | null> {
  const { data } = await supabase
    .from('territory_record_visits')
    .select('result')
    .eq('record_id', recordId)
    .order('visited_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { result: string } | null)?.result ?? null
}

// Cheap do_not_call(+timestamp)-only read — same rationale as getLatestVisitResult, used to
// re-derive getSelectableResults() server-side without pulling the full record + location
// joins. doNotCallAt only matters to the publisher-facing 6-month lock (see
// logPublisherVisitAction) — the Admin's own logVisitAction still calls getSelectableResults
// with just the doNotCall flag, which never locks on its own.
export async function getRecordDoNotCall(
  supabase: SupabaseClient,
  recordId: string
): Promise<{ doNotCall: boolean; doNotCallAt: string | null }> {
  const { data } = await supabase.from('territory_records').select('do_not_call, do_not_call_at').eq('id', recordId).maybeSingle()
  const row = data as { do_not_call: boolean; do_not_call_at: string | null } | null
  return { doNotCall: row?.do_not_call ?? false, doNotCallAt: row?.do_not_call_at ?? null }
}

export async function listVisits(supabase: SupabaseClient, recordId: string): Promise<RecordVisitWithAuthor[]> {
  const { data } = await supabase
    .from('territory_record_visits')
    .select('*, creator:profiles(full_name)')
    .eq('record_id', recordId)
    .order('visited_at', { ascending: false })
  return ((data ?? []) as unknown as Array<Record<string, unknown> & { creator: { full_name: string } | null }>).map(
    (v) => ({ ...(v as unknown as RecordVisitWithAuthor), created_by_name: v.creator?.full_name ?? null })
  )
}

// Admin's Weekly Notes menu (dashboard/weekly-notes) — one row per record whose CURRENT latest
// visit (not just any visit logged this week) falls within [rangeStartIso, rangeEndIso) and has
// a non-empty note, so Override/Undo (both of which always act on a record's true latest visit,
// see overrideLatestVisit/deleteLatestVisit below) apply correctly to every row shown here.
// Fetches visits from rangeStartIso onward with no upper bound so the "first row per record_id,
// ordered newest first" dedup below reliably lands on each record's true latest visit rather
// than an older one that happens to fall in range while an even newer one (possibly past
// rangeEndIso) exists — only then is the deduped set filtered down to the actual window. Both
// bounds are expected to already be full UTC ISO instants (see reports/date.ts's
// startOfDayUtc/endOfDayUtcExclusive), not plain calendar-date strings.
export async function listWeeklyVisitNotes(
  supabase: SupabaseClient,
  congregationId: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<{ record: TerritoryRecordWithLocation; visit: RecordVisitWithAuthor }[]> {
  const { data } = await supabase
    .from('territory_record_visits')
    .select('*, creator:profiles(full_name)')
    .eq('congregation_id', congregationId)
    .gte('visited_at', rangeStartIso)
    .order('visited_at', { ascending: false })

  const seenRecordIds = new Set<string>()
  const latestPerRecord: RecordVisitWithAuthor[] = []
  for (const row of (data ?? []) as unknown as Array<Record<string, unknown> & { record_id: string; creator: { full_name: string } | null }>) {
    if (seenRecordIds.has(row.record_id)) continue
    seenRecordIds.add(row.record_id)
    latestPerRecord.push({ ...(row as unknown as RecordVisitWithAuthor), created_by_name: row.creator?.full_name ?? null })
  }

  // Dismissed (migration 035) is checked against each record's true latest visit, same as the
  // window/notes checks above — so a dismissal only ever hides the note it was dismissed for,
  // and a record naturally reappears once a fresh visit is logged on top of it.
  const inWindowWithNotes = latestPerRecord.filter(
    (v) => v.visited_at < rangeEndIso && v.notes.trim().length > 0 && !v.weekly_note_dismissed_at
  )
  if (inWindowWithNotes.length === 0) return []

  const recordIds = inWindowWithNotes.map((v) => v.record_id)
  const { data: records } = await supabase.from('territory_records').select(RECORD_WITH_LOCATION_SELECT).in('id', recordIds)
  const recordById = new Map(((records ?? []) as unknown as TerritoryRecordWithLocation[]).map((r) => [r.id, r]))

  return inWindowWithNotes
    .map((visit) => {
      const record = recordById.get(visit.record_id)
      return record ? { record, visit } : null
    })
    .filter((row): row is { record: TerritoryRecordWithLocation; visit: RecordVisitWithAuthor } => row !== null)
}

// Admin dismisses one visit's note off the Weekly Notes list without touching the visit itself —
// Visit History, Override, and Undo on the record's detail page are all unaffected.
export async function dismissWeeklyNote(supabase: SupabaseClient, visitId: string): Promise<void> {
  const { error } = await supabase
    .from('territory_record_visits')
    .update({ weekly_note_dismissed_at: new Date().toISOString() })
    .eq('id', visitId)
  if (error) throw error
}

// Logging a 'do_not_call' result also flips the record's own flag — one action instead of
// the admin/publisher having to separately toggle it after the fact.
//
// Only one logged visit per record per calendar day is kept — logging a second visit for the
// same record on the same day overwrites that day's row (matched by a UTC day-boundary range on
// visited_at) instead of inserting a second history entry, so there's never more than one
// update per day in the history.
export async function logVisit(
  supabase: SupabaseClient,
  congregationId: string,
  input: { recordId: string; visitedAt: string; result: string; notes: string; createdBy: string | null; partnerName: string | null }
): Promise<void> {
  const visitedDate = new Date(input.visitedAt)
  const dayStart = new Date(Date.UTC(visitedDate.getUTCFullYear(), visitedDate.getUTCMonth(), visitedDate.getUTCDate()))
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const { data: sameDayVisit } = await supabase
    .from('territory_record_visits')
    .select('id')
    .eq('record_id', input.recordId)
    .gte('visited_at', dayStart.toISOString())
    .lt('visited_at', dayEnd.toISOString())
    .order('visited_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const row = {
    congregation_id: congregationId,
    record_id: input.recordId,
    visited_at: input.visitedAt,
    result: input.result,
    notes: input.notes,
    created_by: input.createdBy,
    partner_name: input.partnerName,
  }

  const { error } = sameDayVisit
    ? await supabase.from('territory_record_visits').update(row).eq('id', sameDayVisit.id)
    : await supabase.from('territory_record_visits').insert(row)
  if (error) throw error

  if (input.result === 'do_not_call') {
    const { error: flagError } = await supabase
      .from('territory_records')
      .update({ do_not_call: true })
      .eq('id', input.recordId)
    if (flagError) throw flagError
  }

  // Retention: hard-delete visit history older than 6 months. Run opportunistically on every
  // write rather than needing a separate scheduled job — best-effort, so a failure here doesn't
  // undo the visit that was just successfully saved above.
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6)
  await supabase.from('territory_record_visits').delete().eq('congregation_id', congregationId).lt('visited_at', sixMonthsAgo.toISOString())
}
