import { z } from 'zod'
import { OpenLocationCode } from 'open-location-code'
import { VISIT_RESULT_CONDUCTOR_PROMPT, householdMembersField } from '@/lib/territory-management-system/modules/records/schema'

// Shared by actions/assignments.ts (admin) and actions/publisher.ts (public, token-gated).

const openLocationCode = new OpenLocationCode()

// Real format validation, not just "is a non-empty string" — a publisher recommending a
// corrected Plus Code is exactly the case where a typo is likely, and the whole point of the
// recommendation is that the Admin trusts it enough to apply with one click. Accepts both full
// ("6PH57VP3+PQ") and short/local ("7FG8+4V") forms, matching how records are actually entered
// elsewhere in this app (see HouseholdDistributionMap's decodePins).
const plusCodeField = z
  .string()
  .min(1, 'Plus Code is required.')
  .max(20)
  .refine((code) => openLocationCode.isValid(code), 'Enter a valid Plus Code (e.g. 7FG8+4V).')

// Unlike records/schema.ts's shared householdMembersField (which leaves a blank value as
// unset — used by Admin's own Add/Edit Record forms), the publisher's Add/Edit-Added-Record
// forms default a blank Household Number to 1 rather than leaving it unset — confirmed with
// Russell, deliberately scoped to just these two publisher-facing schemas.
const publisherHouseholdMembersField = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? 1 : v),
  z.coerce.number().int().min(0)
)

export const createAssignmentSchema = z.object({
  territoryIds: z.array(z.string().uuid()).min(1, 'Select at least one territory.'),
  partnershipCount: z.coerce.number().int().min(1).max(50),
  // How many approved records each partnership can get, capped — the Group Leader's own call on
  // a campaign day rather than a fixed number. Optional: falls back to
  // engine.ts's DEFAULT_MAX_PER_PARTNERSHIP when omitted (e.g. the overflow-assignment form,
  // which never assigns existing records at all — see forceZeroRecords).
  maxPerPartnership: z.coerce.number().int().min(1).max(30).optional(),
})
export type CreateAssignmentInput = z.input<typeof createAssignmentSchema>

export const renamePartnershipSchema = z.object({
  partnershipToken: z.string().min(1),
  name: z.string().min(1).max(60),
})
export type RenamePartnershipInput = z.input<typeof renamePartnershipSchema>

// A Ministry Partner's one-time search-area choice for an overflow batch (see
// 026_partnership_search_blocks.sql / chooseSearchScopeAction) — one section, one or more
// blocks within it. Territory isn't submitted here: it's derived server-side from which section
// the client picked (the action re-verifies that section belongs to one of the batch's own
// territories, same "never trust a client-supplied parent id" rule as everywhere else).
export const chooseSearchScopeSchema = z.object({
  partnershipToken: z.string().min(1),
  sectionId: z.string().uuid(),
  blockIds: z.array(z.string().uuid()).min(1, 'Choose at least one block.'),
})
export type ChooseSearchScopeInput = z.input<typeof chooseSearchScopeSchema>

// initialResult/initialConductorName/initialNotes optionally seed the new record's very first
// visit at creation time — same idea and validation rules as records/schema.ts's
// createRecordSchema, mirrored here since the publisher path runs through its own schema file.
export const addPublisherRecordSchema = z
  .object({
    partnershipToken: z.string().min(1),
    // Generated client-side (crypto.randomUUID()) the moment the publisher submits the form —
    // lets the offline-first UI optimistically render (and immediately allow editing/deleting)
    // the new record under a stable id before this write has even synced.
    recordId: z.string().uuid(),
    territoryId: z.string().uuid(),
    sectionId: z.string().uuid(),
    blockId: z.string().uuid(),
    address: z.string().max(200).optional().default(''),
    unit: z.string().max(40).optional().default(''),
    residentName: z.string().max(120).optional().default(''),
    plusCode: z.string().min(1, 'Plus Code is required.').max(20),
    householdMembers: publisherHouseholdMembersField,
    notes: z.string().max(500).optional().default(''),
    initialResult: z.string().optional().default(''),
    initialConductorName: z.string().max(80).optional().default(''),
    initialNotes: z.string().max(500).optional().default(''),
  })
  .refine((data) => !data.initialResult || data.initialResult !== 'other' || data.initialNotes.trim().length > 0, {
    message: 'Notes are required when the initial status is "Other".',
    path: ['initialNotes'],
  })
  .refine(
    (data) =>
      !data.initialResult ||
      !VISIT_RESULT_CONDUCTOR_PROMPT[data.initialResult as keyof typeof VISIT_RESULT_CONDUCTOR_PROMPT] ||
      data.initialConductorName.trim().length > 0,
    { message: 'Please enter who is conducting the Bible Study.', path: ['initialConductorName'] }
  )
export type AddPublisherRecordInput = z.input<typeof addPublisherRecordSchema>

export const logPublisherVisitSchema = z
  .object({
    partnershipToken: z.string().min(1),
    recordId: z.string().uuid(),
    visitedAt: z.string().min(1),
    result: z.string().min(1),
    notes: z.string().max(500).optional().default(''),
  })
  .refine((data) => data.result !== 'other' || data.notes.trim().length > 0, {
    message: 'Notes are required when the result is "Other".',
    path: ['notes'],
  })
export type LogPublisherVisitInput = z.input<typeof logPublisherVisitSchema>

export const terminatePartnershipEarlySchema = z.object({
  partnershipToken: z.string().min(1),
})
export type TerminatePartnershipEarlyInput = z.input<typeof terminatePartnershipEarlySchema>

// A "change of mind" undo of a claim, not ending the ministry — see releasePartnershipAction,
// only allowed while zero of the partnership's assigned records have been visited yet.
export const releasePartnershipSchema = z.object({
  partnershipToken: z.string().min(1),
})
export type ReleasePartnershipInput = z.input<typeof releasePartnershipSchema>

// Sent from the note screen's Skip/Send handlers — reachable from both the normal Sync &
// Finish path and the End Early path, since both route through that screen.
export const finishPartnershipSchema = z.object({
  partnershipToken: z.string().min(1),
})
export type FinishPartnershipInput = z.input<typeof finishPartnershipSchema>

// destinationPartnershipId is a raw id, not a claim_token — the publisher picks it from a list
// of sibling partnerships in the same batch (fetched server-side), and never has the
// destination's own token.
export const movePartnershipRecordSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
  destinationPartnershipId: z.string().uuid(),
})
export type MovePartnershipRecordInput = z.input<typeof movePartnershipRecordSchema>

// Sent from the end-of-ministry screen, skippable — the form is only submitted at all when the
// publisher actually writes something, so a non-empty note is required at the schema level.
export const submitPartnershipNoteSchema = z.object({
  partnershipToken: z.string().min(1),
  note: z.string().min(1).max(1000),
})
export type SubmitPartnershipNoteInput = z.input<typeof submitPartnershipNoteSchema>

// The unstructured alternative to the full Add Record / Recommend New Location forms — no
// territory/section/block/address, just enough for the Admin to follow up manually. Phone is
// the only optional field; Name and Notes are both required (there's no point sending this with
// neither).
export const submitQuickNoteSchema = z.object({
  partnershipToken: z.string().min(1),
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional().default(''),
  notes: z.string().min(1).max(1000),
})
export type SubmitQuickNoteInput = z.input<typeof submitQuickNoteSchema>

// "Mark as Moved" → "Update Current Resident" path — a different person now lives at this same
// address (location itself hasn't changed, so no Plus Code field), territory/section/block
// never change here either. Instant, no Admin review — same trust level as logging a visit.
export const updatePublisherRecordSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
  address: z.string().max(200).optional().default(''),
  unit: z.string().max(40).optional().default(''),
  residentName: z.string().max(120).optional().default(''),
  plusCode: z.string().max(20).optional().default(''),
  householdMembers: householdMembersField,
  notes: z.string().max(500).optional().default(''),
})
export type UpdatePublisherRecordInput = z.input<typeof updatePublisherRecordSchema>

// "Mark as Moved" → "Suggest New Location" path — the current resident here knows where the
// person who used to live here moved to. resident_name isn't part of this at all (same person,
// only the location changes). No more Plus Code or Territory/Section/Block — the record stays in
// its own territory/section/block; only the street address text and household count change.
// Address and Notes are both required. Review-gated like recommendCorrectionSchema below —
// nothing on the real record changes until the Admin applies it.
export const recommendMoveSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
  address: z.string().min(1, 'Address is required.').max(300),
  householdMembers: householdMembersField,
  notes: z.string().min(1, 'Notes are required.').max(500),
})
export type RecommendMoveInput = z.input<typeof recommendMoveSchema>

// "Mark as Moved" → "Recommend for Admin Removal" path — the reason is required, never an
// optional note, per Russell's explicit instruction.
export const recommendRemovalSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})
export type RecommendRemovalInput = z.input<typeof recommendRemovalSchema>

// The "Update" button — recommends a corrected Plus Code (the most common wrong-data case)
// plus a required reason, without editing the record directly (same review-gated shape as
// recommendRemovalSchema above — the Admin applies or dismisses it). territoryId lets a record
// be recommended into a different barangay entirely, not just a different Section/Block within
// its own — same client-supplied-territoryId shape as recommendMoveSchema above.
export const recommendCorrectionSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
  plusCode: plusCodeField,
  householdMembers: householdMembersField,
  // Optional — lets a publisher recommend a corrected name (e.g. a misspelling) alongside the
  // other fields here, admin-review-gated like everything else in this schema.
  residentName: z.string().max(120).optional().default(''),
  reason: z.string().min(1, 'Please explain what needs to be corrected.').max(500),
  territoryId: z.string().uuid(),
  sectionId: z.string().uuid(),
  blockId: z.string().uuid(),
})
export type RecommendCorrectionInput = z.input<typeof recommendCorrectionSchema>

// Same shape as recommendCorrectionSchema — used for a search-scope record instead (one that
// was never assigned to this partnership at all, see recommendSearchScopeCorrectionAction).
export const recommendSearchScopeCorrectionSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
  plusCode: plusCodeField,
  householdMembers: householdMembersField,
  reason: z.string().min(1, 'Please explain what needs to be corrected.').max(500),
  territoryId: z.string().uuid(),
  sectionId: z.string().uuid(),
  blockId: z.string().uuid(),
})
export type RecommendSearchScopeCorrectionInput = z.input<typeof recommendSearchScopeCorrectionSchema>

// Deleting a record the publisher added themselves — only reachable while their own ministry
// session is still active (see deletePublisherAddedRecordAction).
export const deletePublisherAddedRecordSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
})
export type DeletePublisherAddedRecordInput = z.input<typeof deletePublisherAddedRecordSchema>

// Editing a record the publisher added themselves — same field set as addPublisherRecordSchema
// minus the initial-visit fields (editing a record you added isn't "logging a visit").
export const editPublisherAddedRecordSchema = z.object({
  partnershipToken: z.string().min(1),
  recordId: z.string().uuid(),
  territoryId: z.string().uuid(),
  sectionId: z.string().uuid(),
  blockId: z.string().uuid(),
  address: z.string().max(200).optional().default(''),
  unit: z.string().max(40).optional().default(''),
  residentName: z.string().max(120).optional().default(''),
  plusCode: z.string().min(1, 'Plus Code is required.').max(20),
  householdMembers: publisherHouseholdMembersField,
  notes: z.string().max(500).optional().default(''),
})
export type EditPublisherAddedRecordInput = z.input<typeof editPublisherAddedRecordSchema>
