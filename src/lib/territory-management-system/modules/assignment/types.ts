import type { RecordVisitWithAuthor, TerritoryRecord, TerritoryRecordWithLocation } from '../records/types'

export interface AssignmentBatch {
  id: string
  congregation_id: string
  assignment_date: string
  requested_partnership_count: number
  access_token: string
  // Nullable — batches created before 013_group_leader_assignment_ownership.sql have no
  // creator on record. Every batch created going forward always sets this.
  created_by: string | null
  created_at: string
  // True for a batch created via createOverflowAssignmentAction (see
  // 024_batch_is_overflow.sql) — every partnership always starts with zero records. Lets the
  // Group Leader dashboard's batch switcher label it "Overflow" rather than "Assignment"
  // without guessing from array position, which breaks once the original batch is deleted.
  is_overflow: boolean
}

export interface Partnership {
  id: string
  congregation_id: string
  batch_id: string
  sequence: number
  name: string
  claim_token: string
  claimed_at: string | null
  ended_early_at: string | null
  // Set when the publisher reaches Sync & Finish (Skip or Send on the note screen) — the
  // "we're genuinely done" signal that doesn't depend on record math, so it also covers a
  // zero-record ("searching a fresh territory") partnership, which would otherwise look done
  // the instant it's created. Distinct from ended_early_at (which specifically means unfinished
  // records got marked undone) — a normally-finished session sets this without that.
  finished_at: string | null
  created_at: string
}

export interface PartnershipWithProgress extends Partnership {
  recordCount: number
  completedCount: number
  // Distinct territories this partnership's own assigned records fall in — usually one, but see
  // getBatchSummary's comment: a partnership can span more than one when a territory's record
  // count isn't an exact multiple of maxPerPartnership. Empty for a zero-record partnership.
  territories: { id: string; name: string; description: string }[]
  // Distinct sections this partnership's own assigned records fall in, same "usually one, can
  // span more than one" caveat as territories above. Empty for a zero-record partnership.
  sections: { id: string; label: string }[]
  // Household-grouped count of this partnership's assigned records flagged Do Not Call (locked
  // or not) — shown on the card so a Ministry Partner/Group Leader knows some of their "N
  // records" aren't actually actionable this session.
  dncCount: number
  // True if any of this partnership's assigned records has a latest visit result in the Bible
  // Study family (potential_bible_study/started_bible_study/bible_study) — surfaced as a
  // corner accent on the card.
  hasBibleStudy: boolean
}

export interface BatchSummary extends AssignmentBatch {
  territories: { id: string; name: string; description: string }[]
  partnerships: PartnershipWithProgress[]
  // True once assignment_date is before today in the congregation's timezone — the public
  // landing/progress pages render an "ended" state instead of the live view when this is set.
  expired: boolean
}

export interface PartnershipRecordDetail {
  id: string
  sequence: number
  completed_at: string | null
  // Set when this record was handed to the current partnership via "Pass to Another Partner"
  // (see movePartnershipRecord/022_partnership_pass_tracking.sql) — the source partnership's
  // name at the moment of the move, not a live reference (so it still reads correctly even if
  // that partnership is later renamed). Null for a record that's never been passed.
  passed_from_name: string | null
  passed_from_at: string | null
  record: TerritoryRecord & {
    territory: { id: string; name: string; description: string; map_image_url: string | null } | null
    section: { id: string; label: string } | null
    block: { id: string; label: string } | null
    correction_territory: { id: string; name: string; description: string } | null
    correction_section: { id: string; label: string } | null
    correction_block: { id: string; label: string } | null
    move_territory: { id: string; name: string; description: string } | null
    move_section: { id: string; label: string } | null
    move_block: { id: string; label: string } | null
  }
  // Fetched up front (not on-demand) so the fully client-side offline workspace never needs
  // a network round-trip just to open a record's visit history.
  visits: RecordVisitWithAuthor[]
}

export interface PartnershipWorkspace extends Partnership {
  batch: AssignmentBatch
  congregationName: string
  // IANA zone (e.g. "Asia/Manila"), defaults to 'UTC' if unset — used to correctly convert this
  // partnership's own "Visited at" datetime-local submissions (see localDatetimeToUtcIso), which
  // otherwise silently corrupt by the server-vs-congregation timezone gap.
  timezone: string
  records: PartnershipRecordDetail[]
  territories: { id: string; name: string; description: string; map_image_url: string | null }[]
  // Same meaning as BatchSummary.expired — checked again server-side before every
  // publisher-facing write (rename/log visit/add record), not just used for display.
  expired: boolean
  // Every other Ministry Partner working under the same Group Leader today (original
  // assignment + any overflow batches, see getGroupLeaderPartnershipsForDate) a record can be
  // moved/passed to — excludes this partnership itself and any that already ended their
  // ministry early. batchLabel ("Assignment"/"Overflow"/"Overflow 2"...) disambiguates which
  // batch each sibling belongs to, since this can now span more than one.
  siblingPartnerships: { id: string; name: string; batchLabel: string }[]
  // Records this partnership added via "Add a New Contact Record" — deliberately separate from
  // `records` above (today's assigned list): never linked into partnership_records, still
  // pending Admin review, but visible/editable/deletable by the publisher until their ministry
  // session ends (see created_by_partnership_id on TerritoryRecord).
  addedRecords: TerritoryRecordWithLocation[]
  // Set only once THIS partnership has locked in their own search area (section + blocks,
  // one-time — see 026_partnership_search_blocks.sql and ChooseSearchScopeForm) — null until
  // then, and null forever for a non-overflow partnership (they never see that step at all).
  searchScope: { sectionId: string; sectionLabel: string; blocks: { id: string; label: string }[] } | null
  // Whatever records already exist in that search scope, read-only (see getRecordsInBlocks) —
  // shown so a publisher searching the area doesn't create a duplicate for a household someone
  // already logged. Always empty when searchScope is null.
  searchScopeRecords: TerritoryRecordWithLocation[]
  // Which OTHER Ministry Partner(s) (by name) currently have each of this scope's blocks locked
  // for search today (see getPartnersSearchingBlocks/026_partnership_search_blocks.sql) — blocks
  // are shareable (037_partnership_search_blocks_shareable.sql), so a block can have zero, one,
  // or several. Excludes this partnership's own lock on its own blocks. Keyed by block id; a
  // block with no other current searcher is simply absent from the map. Always empty when
  // searchScope is null.
  searchScopeBlockPartners: Record<string, string[]>
  // Every partnership in THIS batch (including this one), with live progress — the same data
  // the pre-claim "Today's Assignment" batch-landing page shows, fetched up front so the
  // in-workspace "All Partners" tab never needs a real page navigation to render (that
  // navigation used to hard-fail offline — see PublisherBottomMenu). Manually refreshable
  // (see getBatchPartnersAction) but otherwise just a snapshot from initial load.
  batchPartnerships: PartnershipWithProgress[]
  // Pending "Ask" requests for records THIS partnership currently holds (see
  // 042_record_transfer_requests.sql and the Search tab) — fetched up front purely so the Search
  // nav icon's badge count has something to show without navigating there first; the Search tab
  // itself always re-fetches fresh via listIncomingRecordTransferRequestsAction on open/refresh.
  incomingRequests: IncomingRecordTransferRequest[]
  // A congregation-wide reference point (see getCongregationPlusCodeAnchor) letting
  // HouseholdDistributionMap recover a short/local-form Plus Code even when this partnership's
  // own record set (assigned records, or a freshly-chosen search area) has no full-form code of
  // its own to anchor against. Null only if the whole congregation has never captured a single
  // full-form code.
  congregationAnchor: { lat: number; lng: number } | null
}

export interface RecordSearchResult {
  id: string
  residentName: string
  address: string
  plusCode: string | null
  territoryName: string
  // null = not currently assigned to anyone today.
  assignedTo: { partnershipId: string; partnershipName: string; isOverflow: boolean } | null
}

export interface RecordTransferRequestError {
  error: string
}

export interface IncomingRecordTransferRequest {
  id: string
  recordId: string
  residentName: string
  address: string
  requestingPartnershipName: string
  createdAt: string
}
