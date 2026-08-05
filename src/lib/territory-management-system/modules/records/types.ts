export type RecordStatus = 'pending' | 'approved'
export type RecordSource = 'manual' | 'csv_import' | 'publisher'
export type VisitResult =
  | 'initial_visit'
  | 'return_visit'
  | 'potential_bible_study'
  | 'started_bible_study'
  | 'bible_study'
  | 'progressing'
  | 'discontinued'
  | 'study_discontinued'
  | 'not_home'
  | 'do_not_call'
  | 'moved'
  | 'other'
  | 'undone'

export interface TerritoryRecord {
  id: string
  congregation_id: string
  territory_id: string
  section_id: string
  block_id: string
  address: string
  unit: string
  resident_name: string
  plus_code: string | null
  household_members: number | null
  notes: string
  do_not_call: boolean
  // Set automatically by a DB trigger the moment do_not_call flips true (see
  // 027_do_not_call_lock.sql) — null whenever do_not_call is false. Powers the 6-month
  // no-visit-can-be-logged cooldown (see isDoNotCallLocked in records/schema.ts).
  do_not_call_at: string | null
  status: RecordStatus
  source: RecordSource
  // Set when a publisher marks this record "Moved" and chooses "Recommend for Admin Removal"
  // instead of correcting the contact info themselves — see 012_removal_recommendation.sql.
  // removal_recommended_by is the partnership's name (no publisher accounts to key off of).
  removal_recommended_at: string | null
  removal_recommended_reason: string | null
  removal_recommended_by: string | null
  // Which partnership added this record via the publisher workspace's "Add a New Contact
  // Record" form (null for admin/CSV-created records) — see 019_publisher_added_record_ownership.sql.
  // Powers the publisher's own "My Added Records" list, kept separate from partnership_records
  // (today's assigned-record list) and from the pending-review gate (still Admin-only).
  created_by_partnership_id: string | null
  // Set when a publisher taps "Update" on an assigned record (e.g. a wrong Plus Code) and
  // recommends a correction — see 020_correction_recommendation.sql. Same review-gated shape
  // as removal_recommended_* above: the record itself is untouched until the Admin applies it.
  correction_recommended_at: string | null
  correction_recommended_plus_code: string | null
  correction_recommended_reason: string | null
  correction_recommended_by: string | null
  // Section/Block half of the same correction recommendation above — see
  // 030_correction_section_block.sql. Independent of the Plus Code fields; a recommendation can
  // touch either or both.
  correction_recommended_section_id: string | null
  correction_recommended_block_id: string | null
  // Household Members half of the same correction recommendation — see
  // 031_correction_household_members.sql.
  correction_recommended_household_members: number | null
  // Resident Name half of the same correction recommendation — see
  // 041_correction_resident_name.sql.
  correction_recommended_resident_name: string | null
  // Territory (barangay) half of the same correction recommendation — see
  // 034_correction_recommendation_territory.sql. A record can be filed under the wrong barangay
  // entirely, not just the wrong Section/Block within the right one.
  correction_recommended_territory_id: string | null
  // Publisher-facing "Unlocated" -> "They Moved, New Location Known" recommendation — see
  // 032_move_recommendation.sql. Same review-gated shape as removal/correction above: the
  // record's real address/unit/plus_code/household_members stay untouched until the Admin
  // applies it. resident_name is deliberately not part of this — same person, new location.
  move_recommended_at: string | null
  move_recommended_address: string | null
  move_recommended_unit: string | null
  move_recommended_plus_code: string | null
  move_recommended_household_members: number | null
  move_recommended_notes: string | null
  move_recommended_by: string | null
  // Territory (barangay)/Section/Block half of the same move recommendation — see
  // 033_move_recommendation_location.sql. Independent columns from the address/plus_code fields
  // above; a move recommendation always carries a full new location (address + territory +
  // section + block together), not a partial one.
  move_recommended_territory_id: string | null
  move_recommended_section_id: string | null
  move_recommended_block_id: string | null
  // Stamped only when the Admin's own Add/Edit Contact Record forms are used (createRecord's
  // addedByAdminId / updateRecord's editedByAdminId in records/queries.ts) — null for
  // publisher-added/edited or CSV-imported records. Powers the "Added by X on Y" / "Last
  // edited by X on Y" note on the record detail page.
  admin_added_by: string | null
  admin_added_at: string | null
  admin_edited_by: string | null
  admin_edited_at: string | null
  created_at: string
  updated_at: string
}

export interface TerritoryRecordWithLocation extends TerritoryRecord {
  territory: { id: string; name: string; description: string } | null
  section: { id: string; label: string } | null
  block: { id: string; label: string } | null
  correction_section: { id: string; label: string } | null
  correction_block: { id: string; label: string } | null
  correction_territory: { id: string; name: string; description: string } | null
  move_territory: { id: string; name: string; description: string } | null
  move_section: { id: string; label: string } | null
  move_block: { id: string; label: string } | null
  added_by_profile: { full_name: string } | null
  edited_by_profile: { full_name: string } | null
}

export interface RecordVisit {
  id: string
  congregation_id: string
  record_id: string
  visited_at: string
  result: VisitResult
  notes: string
  created_by: string | null
  partner_name: string | null
  created_at: string
  // Set when an Admin overrides this visit's result/notes after the fact (see
  // overrideLatestVisitAction, migration 029) — null for a visit that's never been touched by
  // an Admin. visited_at/created_by/partner_name stay as the original submission's.
  overridden_by_admin_at: string | null
  // Set when an Admin dismisses this visit's note off the Weekly Notes list (migration 035) —
  // does not affect Visit History, Override, or Undo, which all still act on this same row.
  weekly_note_dismissed_at: string | null
}

export interface RecordVisitWithAuthor extends RecordVisit {
  created_by_name: string | null
}

export type RecordHistoryAction =
  | 'created'
  | 'edited'
  | 'correction_recommended'
  | 'correction_applied'
  | 'correction_dismissed'
  | 'move_recommended'
  | 'move_applied'
  | 'move_dismissed'
  | 'removal_recommended'
  | 'removal_dismissed'

// A record's own change history — distinct from RecordVisit (field-ministry visit results).
// actor_name is a plain-text snapshot (Admin's full_name at write time, or a partnership's
// name), not a live profiles join — same "no live join" choice as
// removal_recommended_by/correction_recommended_by/move_recommended_by on TerritoryRecord.
export interface RecordHistoryEntry {
  id: string
  congregation_id: string
  record_id: string
  action: RecordHistoryAction
  summary: string
  actor_role: 'admin' | 'publisher'
  actor_name: string | null
  created_at: string
}
