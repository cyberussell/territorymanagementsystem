'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { localDatetimeToUtcIso } from '@/lib/territory-management-system/modules/assignment/date'
import { checkRateLimit, clientIp } from '@/lib/territory-management-system/rateLimit'
import { logError } from '@/lib/territory-management-system/errors'
import {
  addPublisherRecordSchema,
  chooseSearchScopeSchema,
  deletePublisherAddedRecordSchema,
  editPublisherAddedRecordSchema,
  finishPartnershipSchema,
  logPublisherVisitSchema,
  movePartnershipRecordSchema,
  recommendCorrectionSchema,
  recommendMoveSchema,
  recommendRemovalSchema,
  recommendSearchScopeCorrectionSchema,
  releasePartnershipSchema,
  renamePartnershipSchema,
  submitPartnershipNoteSchema,
  submitQuickNoteSchema,
  terminatePartnershipEarlySchema,
  updatePublisherRecordSchema,
} from '@/lib/territory-management-system/modules/assignment/schema'
import {
  addPartnershipQuickNote,
  claimUnassignedRecord,
  createRecordTransferRequest,
  finishPartnership,
  getBatchById,
  getBatchSummary,
  getPartnersSearchingBlocks,
  getPartnershipById,
  getPartnershipByToken,
  getSearchScopeForPartnership,
  listIncomingRecordTransferRequests,
  lockPartnershipSearchBlocks,
  markPartnershipRecordCompleted,
  movePartnershipRecord,
  partnershipHasRecord,
  releasePartnership,
  renamePartnership,
  resolveRecordTransferRequest,
  searchTodaysAssignedRecords,
  submitPartnershipNote,
  terminatePartnershipEarly,
} from '@/lib/territory-management-system/modules/assignment/queries'
import type {
  IncomingRecordTransferRequest,
  PartnershipWithProgress,
  RecordSearchResult,
} from '@/lib/territory-management-system/modules/assignment/types'
import {
  createRecord,
  deleteRecord,
  getLatestVisitResult,
  getRecordById,
  getRecordDoNotCall,
  getRecordsInBlocks,
  logVisit,
  recommendRecordCorrection,
  recommendRecordForRemoval,
  recommendRecordMove,
  recordAddedByPartnership,
  territorySectionBlockBelongsToCongregation,
  updateRecord,
} from '@/lib/territory-management-system/modules/records/queries'
import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'
import { getSelectableResults, mergeConductorIntoNotes } from '@/lib/territory-management-system/modules/records/schema'
import { getTerritoryStructure } from '@/lib/territory-management-system/modules/territory/queries'
import { type ActionResult } from './shared'

// Every action here is reachable with no login at all — the opaque partnership token in the
// form is the only credential. Each one re-resolves the token against the DB itself (never
// trusts anything the client claims about which partnership/congregation it belongs to) using
// the service-role client, since there's no publisher Supabase session for RLS to key off of.

export async function renamePartnershipAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = renamePartnershipSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    name: formData.get('name'),
  })
  if (!parsed.success) return { error: 'Enter a valid partnership name.' }
  if (!(await checkRateLimit(`tms-rename:${clientIp(await headers())}`, 10))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  // A session that was already open before midnight could still try to submit after — the
  // client-side "ended" screen is a courtesy, this is the actual enforcement.
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  await renamePartnership(supabase, partnership.id, parsed.data.name)
  revalidatePath(`/tms/assignment/${partnership.batch.access_token}`)
  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

export async function logPublisherVisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = logPublisherVisitSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    visitedAt: formData.get('visitedAt'),
    result: formData.get('result'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) {
    const notesIssue = parsed.error.issues.find((i) => i.path.includes('notes'))
    return { error: notesIssue?.message ?? 'Please fill in the visit details correctly.' }
  }
  if (!(await checkRateLimit(`tms-visit:${clientIp(await headers())}`, 40))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  const owns = await partnershipHasRecord(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record is not assigned to your partnership.' }

  // Re-derive the selectable results the same way the client's form does (from the record's
  // latest visit result + do_not_call flag/timestamp) rather than checking a static list — a
  // static list can't account for the Bible Study follow-up or Do Not Call narrowing
  // (getSelectableResults), which is exactly what caused Progressing/Discontinued to be wrongly
  // rejected here before this fix. Passing doNotCallAt also means a locked record (still within
  // its 6-month cooldown, see 027_do_not_call_lock.sql) gets an empty selectable list here — a
  // crafted/stale submission can't bypass the client's own locked-notice UI.
  const [latestResult, { doNotCall, doNotCallAt }] = await Promise.all([
    getLatestVisitResult(supabase, parsed.data.recordId),
    getRecordDoNotCall(supabase, parsed.data.recordId),
  ])
  const selectable = getSelectableResults(latestResult, doNotCall, doNotCallAt)
  if (!(selectable as readonly string[]).includes(parsed.data.result)) return { error: 'Invalid visit result.' }

  try {
    await logVisit(supabase, partnership.congregation_id, {
      recordId: parsed.data.recordId,
      visitedAt: localDatetimeToUtcIso(parsed.data.visitedAt, partnership.timezone),
      result: parsed.data.result,
      notes: parsed.data.notes,
      createdBy: null,
      partnerName: partnership.name || null,
    })
    await markPartnershipRecordCompleted(supabase, partnership.id, parsed.data.recordId)
  } catch (e) {
    await logError(partnership.congregation_id, 'logPublisherVisitAction', e)
    return { error: e instanceof Error ? e.message : 'Could not log the visit.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// New records added here are 'pending'/'publisher'-sourced, same review gate as CSV import —
// they never retroactively appear in today's own partnership list (partnership_records).
// Stamped with created_by_partnership_id instead, which is what powers the publisher's own
// separate "My Added Records" list and its edit/delete permission checks.
export async function addPublisherRecordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = addPublisherRecordSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    territoryId: formData.get('territoryId'),
    sectionId: formData.get('sectionId'),
    blockId: formData.get('blockId'),
    address: formData.get('address'),
    unit: formData.get('unit'),
    residentName: formData.get('residentName'),
    plusCode: formData.get('plusCode'),
    householdMembers: formData.get('householdMembers'),
    notes: formData.get('notes'),
    initialResult: formData.get('initialResult'),
    initialConductorName: formData.get('initialConductorName'),
    initialNotes: formData.get('initialNotes'),
  })
  if (!parsed.success) return { error: 'Please fill in the required fields.' }
  if (!(await checkRateLimit(`tms-add-record:${clientIp(await headers())}`, 15))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  // A session that was already open before midnight could still try to submit after — the
  // client-side "ended" screen is a courtesy, this is the actual enforcement.
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }
  if (partnership.finished_at || partnership.ended_early_at) return { error: 'Your ministry session has already ended.' }

  // This path runs on the service-role client (no RLS), so it must independently verify the
  // submitted territory/section/block chain actually belongs to this partnership's own
  // congregation before writing anything — otherwise a crafted request with a valid token but
  // a foreign territoryId could plant a record inside a different congregation's territory.
  const territory = await getTerritoryStructure(supabase, partnership.congregation_id, parsed.data.territoryId)
  const section = territory?.sections.find((s) => s.id === parsed.data.sectionId)
  const block = section?.blocks.find((b) => b.id === parsed.data.blockId)
  if (!territory || !section || !block) return { error: 'Invalid territory, section, or block.' }

  // Once this partnership has locked in a search area (see 026_partnership_search_blocks.sql),
  // every new record they add must stay within it — never trust the client's submitted
  // section/block outright, even though PublisherRecordForm's own picker already narrows to
  // just these blocks. A partnership with no locked scope (regular, non-overflow partnerships,
  // or an overflow one that somehow reached this form before choosing one) keeps today's
  // existing whole-territory behavior.
  const searchScope = await getSearchScopeForPartnership(supabase, partnership.id)
  if (searchScope && !searchScope.blocks.some((b) => b.id === parsed.data.blockId)) {
    return { error: 'You can only add records within your locked search area.' }
  }

  // A blank initialResult here re-derives the full SELECTABLE_VISIT_RESULTS list (a fresh
  // record has no prior visit and is never do_not_call yet), same re-validation pattern
  // logPublisherVisitAction already applies rather than trusting the submitted value outright.
  if (parsed.data.initialResult && !(getSelectableResults() as readonly string[]).includes(parsed.data.initialResult)) {
    return { error: 'Invalid initial status.' }
  }

  try {
    const record = await createRecord(supabase, partnership.congregation_id, {
      id: parsed.data.recordId,
      territoryId: parsed.data.territoryId,
      sectionId: parsed.data.sectionId,
      blockId: parsed.data.blockId,
      address: parsed.data.address,
      unit: parsed.data.unit,
      residentName: parsed.data.residentName,
      plusCode: parsed.data.plusCode,
      householdMembers: parsed.data.householdMembers,
      notes: parsed.data.notes,
      doNotCall: false,
      status: 'pending',
      source: 'publisher',
      createdByPartnershipId: partnership.id,
      historyActor: { role: 'publisher', name: partnership.name || 'Unnamed partnership' },
    })
    // Not marked as a completed partnership record — a just-added record is still pending admin
    // review and was never assigned to this partnership in the first place (see the comment on
    // this action's declaration).
    if (parsed.data.initialResult) {
      await logVisit(supabase, partnership.congregation_id, {
        recordId: record.id,
        visitedAt: new Date().toISOString(),
        result: parsed.data.initialResult,
        notes: mergeConductorIntoNotes(parsed.data.initialConductorName, parsed.data.initialNotes),
        createdBy: null,
        partnerName: partnership.name || null,
      })
    }
  } catch (e) {
    await logError(partnership.congregation_id, 'addPublisherRecordAction', e)
    return { error: e instanceof Error ? e.message : 'Could not add the contact record.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// Passes an assigned record to a different Ministry Partner working under the same Group
// Leader today (their original assignment or any overflow batch — see
// getGroupLeaderPartnershipsForDate) — not just the same batch. Both sides are re-resolved
// server-side (the source via the caller's own token, the destination by id) — never trusts
// the client's claim that the destination actually belongs to a valid batch.
export async function movePartnershipRecordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = movePartnershipRecordSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    destinationPartnershipId: formData.get('destinationPartnershipId'),
  })
  if (!parsed.success) return { error: 'Invalid request.' }
  if (!(await checkRateLimit(`tms-move-record:${clientIp(await headers())}`, 20))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }
  if (parsed.data.destinationPartnershipId === partnership.id) return { error: 'Choose a different Ministry Partner.' }

  const owns = await partnershipHasRecord(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record is not assigned to your partnership.' }

  const destination = await getPartnershipById(supabase, parsed.data.destinationPartnershipId)
  if (!destination) return { error: 'Invalid destination Ministry Partner.' }
  const destinationBatch = await getBatchById(supabase, destination.batch_id)
  const sameGroupLeaderToday =
    destinationBatch &&
    destinationBatch.congregation_id === partnership.batch.congregation_id &&
    destinationBatch.assignment_date === partnership.batch.assignment_date &&
    destinationBatch.created_by !== null &&
    destinationBatch.created_by === partnership.batch.created_by
  if (!sameGroupLeaderToday && destination.batch_id !== partnership.batch_id) {
    return { error: 'Invalid destination Ministry Partner.' }
  }
  if (destination.ended_early_at || destination.finished_at) return { error: 'That Ministry Partner has already ended their ministry for today.' }

  try {
    await movePartnershipRecord(supabase, partnership.id, destination.id, parsed.data.recordId, partnership.name)
  } catch (e) {
    await logError(partnership.congregation_id, 'movePartnershipRecordAction', e)
    return { error: e instanceof Error ? e.message : 'Could not move the contact record.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

export async function terminatePartnershipEarlyAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = terminatePartnershipEarlySchema.safeParse({ partnershipToken: formData.get('partnershipToken') })
  if (!parsed.success) return { error: 'Invalid request.' }
  if (!(await checkRateLimit(`tms-terminate:${clientIp(await headers())}`, 5))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  try {
    await terminatePartnershipEarly(supabase, partnership.id)
  } catch (e) {
    await logError(partnership.congregation_id, 'terminatePartnershipEarlyAction', e)
    return { error: e instanceof Error ? e.message : 'Could not end the ministry session.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}`)
  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// "Release" — a change of mind before any real work happened, not ending the ministry (that's
// terminatePartnershipEarlyAction above). Only allowed while every one of this partnership's
// assigned records is still uncompleted — the moment even one visit is logged, this becomes
// real field work and can no longer be undone this way. Resets the partnership back to
// unclaimed so it shows up as available again on the batch landing page. Called directly (not
// through the offline sync queue) since it needs a live, current answer about whether any visit
// has actually been logged yet — the same reasoning as chooseSearchScopeAction.
export async function releasePartnershipAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = releasePartnershipSchema.safeParse({ partnershipToken: formData.get('partnershipToken') })
  if (!parsed.success) return { error: 'Invalid request.' }
  if (!(await checkRateLimit(`tms-release:${clientIp(await headers())}`, 10))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }
  if (!partnership.claimed_at) return { error: 'This partnership has not been claimed yet.' }
  if (partnership.finished_at || partnership.ended_early_at) return { error: 'This ministry session has already ended.' }
  if (partnership.records.some((r) => r.completed_at)) {
    return { error: "You've already logged a visit — this can no longer be released." }
  }

  try {
    await releasePartnership(supabase, partnership.id, partnership.sequence)
  } catch (e) {
    await logError(partnership.congregation_id, 'releasePartnershipAction', e)
    return { error: e instanceof Error ? e.message : 'Could not release this partnership.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}`)
  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// Marks the partnership genuinely finished — called from the note screen's Skip/Send handlers,
// reachable from both the normal Sync & Finish path and the End Early path (both route through
// that same screen). Not gated on partnership.expired: a session finishing right at the day
// boundary should still be able to record that it finished. Doesn't require record ownership
// checks like most actions here — there's nothing to verify beyond "this token is real."
export async function finishPartnershipAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = finishPartnershipSchema.safeParse({ partnershipToken: formData.get('partnershipToken') })
  if (!parsed.success) return { error: 'Invalid request.' }
  if (!(await checkRateLimit(`tms-finish:${clientIp(await headers())}`, 10))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }

  try {
    await finishPartnership(supabase, partnership.id)
  } catch (e) {
    await logError(partnership.congregation_id, 'finishPartnershipAction', e)
    return { error: e instanceof Error ? e.message : 'Could not finish the ministry session.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}`)
  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// Optional end-of-ministry note to the Admin — skippable, so this is only ever enqueued when
// the publisher actually writes something (see PublisherWorkspaceApp's note screen). Not
// gated on partnership.expired like the other actions here: a session finishing right at the
// day boundary should still be able to leave its note.
export async function submitPartnershipNoteAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = submitPartnershipNoteSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    note: formData.get('note'),
  })
  if (!parsed.success) return { error: 'Please enter a note.' }
  if (!(await checkRateLimit(`tms-note:${clientIp(await headers())}`, 5))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }

  try {
    await submitPartnershipNote(supabase, partnership.id, parsed.data.note)
  } catch (e) {
    await logError(partnership.congregation_id, 'submitPartnershipNoteAction', e)
    return { error: e instanceof Error ? e.message : 'Could not send the note.' }
  }

  return { error: 'SAVED' }
}

// The unstructured alternative to the full Add Record / Recommend New Location forms — see
// submitQuickNoteSchema. Not gated on partnership.expired, same reasoning as
// submitPartnershipNoteAction above.
export async function sendQuickNoteAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = submitQuickNoteSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) return { error: 'Please fill in the required fields.' }
  if (!(await checkRateLimit(`tms-quicknote:${clientIp(await headers())}`, 5))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }

  try {
    await addPartnershipQuickNote(supabase, partnership.id, partnership.congregation_id, {
      name: parsed.data.name,
      phone: parsed.data.phone ?? '',
      notes: parsed.data.notes,
    })
  } catch (e) {
    await logError(partnership.congregation_id, 'sendQuickNoteAction', e)
    return { error: e instanceof Error ? e.message : 'Could not send the note.' }
  }

  return { error: 'SAVED' }
}

// "Mark as Moved" → "Update Current Resident" path — territory/section/block are never touched
// (same location, a different person now lives here), and do_not_call is read from the existing
// row and passed straight through so this narrower form can't accidentally clear it. Still logs
// a real 'moved' visit underneath so the card tone/stats stay consistent with the other "Mark as
// Moved" paths.
export async function updatePublisherRecordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = updatePublisherRecordSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    address: formData.get('address'),
    unit: formData.get('unit'),
    residentName: formData.get('residentName'),
    plusCode: formData.get('plusCode'),
    householdMembers: formData.get('householdMembers'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) return { error: 'Please fill in the required fields.' }
  if (!(await checkRateLimit(`tms-update-record:${clientIp(await headers())}`, 15))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  const owns = await partnershipHasRecord(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record is not assigned to your partnership.' }

  const existing = await getRecordById(supabase, partnership.congregation_id, parsed.data.recordId)
  if (!existing) return { error: 'Contact record not found.' }

  try {
    await updateRecord(supabase, partnership.congregation_id, parsed.data.recordId, {
      address: parsed.data.address,
      unit: parsed.data.unit,
      residentName: parsed.data.residentName,
      plusCode: parsed.data.plusCode,
      householdMembers: parsed.data.householdMembers ?? existing.household_members ?? undefined,
      notes: parsed.data.notes,
      doNotCall: existing.do_not_call,
      historyActor: { role: 'publisher', name: partnership.name || 'Unnamed partnership' },
    })
    await logVisit(supabase, partnership.congregation_id, {
      recordId: parsed.data.recordId,
      visitedAt: new Date().toISOString(),
      result: 'moved',
      notes: 'Contact record updated after move.',
      createdBy: null,
      partnerName: partnership.name || null,
    })
    await markPartnershipRecordCompleted(supabase, partnership.id, parsed.data.recordId)
  } catch (e) {
    await logError(partnership.congregation_id, 'updatePublisherRecordAction', e)
    return { error: e instanceof Error ? e.message : 'Could not update the contact record.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// "Mark as Moved" → "Recommend New Location" path — the current resident here knows where the
// person who used to live here moved to. Unlike Update Current Resident above, this doesn't
// touch the record directly — it's review-gated like recommendCorrectionAction below, so the
// Admin applies or dismisses it. Still logs a real 'moved' visit and marks the assignment
// completed, same as the other two "Mark as Moved" paths, since a real visit did happen.
export async function recommendMoveAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = recommendMoveSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    address: formData.get('address'),
    householdMembers: formData.get('householdMembers'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the required fields.' }
  if (!(await checkRateLimit(`tms-recommend-move:${clientIp(await headers())}`, 15))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  const owns = await partnershipHasRecord(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record is not assigned to your partnership.' }

  try {
    await recommendRecordMove(
      supabase,
      partnership.congregation_id,
      parsed.data.recordId,
      {
        address: parsed.data.address,
        householdMembers: parsed.data.householdMembers,
        notes: parsed.data.notes,
      },
      partnership.name || 'Unnamed partnership'
    )
    await logVisit(supabase, partnership.congregation_id, {
      recordId: parsed.data.recordId,
      visitedAt: new Date().toISOString(),
      result: 'moved',
      notes: 'New location recommended after move.',
      createdBy: null,
      partnerName: partnership.name || null,
    })
    await markPartnershipRecordCompleted(supabase, partnership.id, parsed.data.recordId)
  } catch (e) {
    await logError(partnership.congregation_id, 'recommendMoveAction', e)
    return { error: e instanceof Error ? e.message : 'Could not submit the recommendation.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// "Mark as Moved" → "Recommend for Admin Removal" path — the reason is required (enforced by
// recommendRemovalSchema), never an optional note. Also logs a real 'moved' visit, same as the
// Update Contact Record path above, so both paths leave the record in the same visible state.
export async function recommendRemovalAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = recommendRemovalSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) return { error: 'Please enter a reason for the recommendation.' }
  if (!(await checkRateLimit(`tms-recommend-removal:${clientIp(await headers())}`, 15))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  const owns = await partnershipHasRecord(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record is not assigned to your partnership.' }

  try {
    await recommendRecordForRemoval(supabase, partnership.congregation_id, parsed.data.recordId, parsed.data.reason, partnership.name || 'Unnamed partnership')
    await logVisit(supabase, partnership.congregation_id, {
      recordId: parsed.data.recordId,
      visitedAt: new Date().toISOString(),
      result: 'moved',
      notes: parsed.data.reason,
      createdBy: null,
      partnerName: partnership.name || null,
    })
    await markPartnershipRecordCompleted(supabase, partnership.id, parsed.data.recordId)
  } catch (e) {
    await logError(partnership.congregation_id, 'recommendRemovalAction', e)
    return { error: e instanceof Error ? e.message : 'Could not submit the recommendation.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// The "Update" button — recommends a corrected Plus Code (or other wrong info) for an assigned
// record, without editing it directly. Unlike the "Mark as Moved" paths above, this is NOT a
// ministry-visit outcome — the household situation hasn't changed, only the recorded data is
// wrong — so it deliberately does not log a visit or mark the record completed. The Admin
// reviews and applies (or dismisses) it from the Flagged for Correction list.
export async function recommendCorrectionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = recommendCorrectionSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    plusCode: formData.get('plusCode'),
    householdMembers: formData.get('householdMembers'),
    residentName: formData.get('residentName'),
    reason: formData.get('reason'),
    territoryId: formData.get('territoryId'),
    sectionId: formData.get('sectionId'),
    blockId: formData.get('blockId'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the Plus Code and a reason for the recommendation.' }
  if (!(await checkRateLimit(`tms-recommend-correction:${clientIp(await headers())}`, 15))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  const owns = await partnershipHasRecord(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record is not assigned to your partnership.' }

  const record = await getRecordById(supabase, partnership.congregation_id, parsed.data.recordId)
  if (!record) return { error: 'This contact record no longer exists.' }
  // territoryId is client-supplied here (a correction can move a record into a different
  // barangay entirely, not just a different Section/Block within its own) — needs the same
  // congregation-ownership check as recommendMoveAction, not just sectionBlockBelongsToTerritory.
  const validScope = await territorySectionBlockBelongsToCongregation(
    supabase,
    partnership.congregation_id,
    parsed.data.territoryId,
    parsed.data.sectionId,
    parsed.data.blockId
  )
  if (!validScope) return { error: 'Choose a valid Barangay, Section, and Block.' }

  try {
    await recommendRecordCorrection(
      supabase,
      partnership.congregation_id,
      parsed.data.recordId,
      {
        plusCode: parsed.data.plusCode,
        reason: parsed.data.reason,
        territoryId: parsed.data.territoryId,
        sectionId: parsed.data.sectionId,
        blockId: parsed.data.blockId,
        householdMembers: parsed.data.householdMembers,
        residentName: parsed.data.residentName || undefined,
      },
      partnership.name || 'Unnamed partnership'
    )
  } catch (e) {
    await logError(partnership.congregation_id, 'recommendCorrectionAction', e)
    return { error: e instanceof Error ? e.message : 'Could not submit the recommendation.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// Deletes a record the publisher added themselves this session (never one that was actually
// assigned — recordAddedByPartnership only matches created_by_partnership_id, which is
// unrelated to partnership_records). Hard-blocked once the ministry session has ended, both
// normally (finished_at) or early (ended_early_at) — not just client-side hidden, since this
// runs on the service-role client with no RLS to fall back on.
export async function deletePublisherAddedRecordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = deletePublisherAddedRecordSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
  })
  if (!parsed.success) return { error: 'Invalid request.' }
  if (!(await checkRateLimit(`tms-delete-added-record:${clientIp(await headers())}`, 15))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }
  if (partnership.finished_at || partnership.ended_early_at) return { error: 'Your ministry session has already ended.' }

  const owns = await recordAddedByPartnership(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record was not added by your partnership.' }

  try {
    await deleteRecord(supabase, parsed.data.recordId)
  } catch (e) {
    await logError(partnership.congregation_id, 'deletePublisherAddedRecordAction', e)
    return { error: e instanceof Error ? e.message : 'Could not delete the contact record.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

// Edits a record the publisher added themselves this session — unlike
// updatePublisherRecordAction ("Mark as Moved" → "Update Contact Record"), territory/section/
// block ARE editable here (a publisher correcting where they placed their own new record is a
// different situation than correcting contact info on an already-assigned one). Same
// finished_at/ended_early_at hard-block as the delete action above.
export async function editPublisherAddedRecordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = editPublisherAddedRecordSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    territoryId: formData.get('territoryId'),
    sectionId: formData.get('sectionId'),
    blockId: formData.get('blockId'),
    address: formData.get('address'),
    unit: formData.get('unit'),
    residentName: formData.get('residentName'),
    plusCode: formData.get('plusCode'),
    householdMembers: formData.get('householdMembers'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) return { error: 'Please fill in the required fields.' }
  if (!(await checkRateLimit(`tms-edit-added-record:${clientIp(await headers())}`, 15))) return { error: 'Too many attempts. Please wait a moment.' }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }
  if (partnership.finished_at || partnership.ended_early_at) return { error: 'Your ministry session has already ended.' }

  const owns = await recordAddedByPartnership(supabase, partnership.id, parsed.data.recordId)
  if (!owns) return { error: 'This contact record was not added by your partnership.' }

  const territory = await getTerritoryStructure(supabase, partnership.congregation_id, parsed.data.territoryId)
  const section = territory?.sections.find((s) => s.id === parsed.data.sectionId)
  const block = section?.blocks.find((b) => b.id === parsed.data.blockId)
  if (!territory || !section || !block) return { error: 'Invalid territory, section, or block.' }

  const existing = await getRecordById(supabase, partnership.congregation_id, parsed.data.recordId)
  if (!existing) return { error: 'Contact record not found.' }

  try {
    await updateRecord(supabase, partnership.congregation_id, parsed.data.recordId, {
      territoryId: parsed.data.territoryId,
      sectionId: parsed.data.sectionId,
      blockId: parsed.data.blockId,
      address: parsed.data.address,
      unit: parsed.data.unit,
      residentName: parsed.data.residentName,
      plusCode: parsed.data.plusCode,
      householdMembers: parsed.data.householdMembers,
      notes: parsed.data.notes,
      doNotCall: existing.do_not_call,
      historyActor: { role: 'publisher', name: partnership.name || 'Unnamed partnership' },
    })
  } catch (e) {
    await logError(partnership.congregation_id, 'editPublisherAddedRecordAction', e)
    return { error: e instanceof Error ? e.message : 'Could not update the contact record.' }
  }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}

export interface SearchScopeRecordsResult {
  records: TerritoryRecordWithLocation[]
  // See getPartnersSearchingBlocks — who else currently has each block locked for search today.
  blockPartners: Record<string, string[]>
}

// Manual "Refresh" for the partnership's search-scope records list — a plain read, not queued
// through the offline sync system, since the whole point is checking the LIVE state (has anyone
// else logged this address in the last few minutes) rather than whatever was cached at initial
// page load. Re-derives the scope from the partnership's own locked blocks (see
// 026_partnership_search_blocks.sql) rather than trusting a client-supplied block list.
export async function getSearchScopeRecordsAction(partnershipToken: string): Promise<SearchScopeRecordsResult> {
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership) return { records: [], blockPartners: {} }
  const scope = await getSearchScopeForPartnership(supabase, partnership.id)
  if (!scope) return { records: [], blockPartners: {} }
  const blockIds = scope.blocks.map((b) => b.id)
  const [records, blockPartners] = await Promise.all([
    getRecordsInBlocks(supabase, partnership.congregation_id, blockIds),
    getPartnersSearchingBlocks(supabase, partnership.congregation_id, blockIds, partnership.batch.assignment_date, partnership.id),
  ])
  return { records, blockPartners }
}

// Manual "Refresh" for the in-workspace "All Partners" tab — same "plain read, not queued
// through the offline sync system" reasoning as getSearchScopeRecordsAction above. Re-derives
// the batch from the partnership's own token rather than trusting a client-supplied batch id.
export async function getBatchPartnersAction(partnershipToken: string): Promise<PartnershipWithProgress[]> {
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership) return []
  const batchSummary = await getBatchSummary(supabase, partnership.congregation_id, partnership.batch_id)
  return batchSummary?.partnerships ?? []
}

// Backs the publisher workspace's Search tab — a live, on-demand lookup (not offline-queued;
// there's no meaningful "search offline" against congregation-wide live assignment state).
// Requires at least 2 characters (see searchTodaysAssignedRecords) so an empty/near-empty query
// doesn't return a huge unfiltered list.
export async function searchTodaysRecordsAction(partnershipToken: string, query: string): Promise<RecordSearchResult[]> {
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership) return []
  return searchTodaysAssignedRecords(supabase, partnership.congregation_id, partnership.batch.assignment_date, query)
}

// "Ask" — sends a pending request to whoever currently holds the record, rather than an instant
// transfer. See createRecordTransferRequest for the cross-group (Auxiliary-cannot-take-from-
// House-To-House) enforcement.
export async function requestRecordTransferAction(partnershipToken: string, recordId: string): Promise<ActionResult> {
  if (!(await checkRateLimit(`tms-request-transfer:${clientIp(await headers())}`, 20))) {
    return { error: 'Too many attempts. Please wait a moment.' }
  }
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  try {
    const result = await createRecordTransferRequest(supabase, partnership.congregation_id, recordId, partnership.id, partnership.batch.is_overflow)
    if ('error' in result) return { error: result.error }
  } catch (e) {
    await logError(partnership.congregation_id, 'requestRecordTransferAction', e)
    return { error: e instanceof Error ? e.message : 'Could not send the request.' }
  }
  return { error: 'SAVED' }
}

// Instant claim for a Search-tab result with no current holder — no approval needed, see
// claimUnassignedRecord.
export async function claimUnassignedRecordAction(partnershipToken: string, recordId: string): Promise<ActionResult> {
  if (!(await checkRateLimit(`tms-claim-unassigned:${clientIp(await headers())}`, 20))) {
    return { error: 'Too many attempts. Please wait a moment.' }
  }
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  try {
    const result = await claimUnassignedRecord(supabase, partnership.congregation_id, recordId, partnership.id)
    if ('error' in result) return { error: result.error }
  } catch (e) {
    await logError(partnership.congregation_id, 'claimUnassignedRecordAction', e)
    return { error: e instanceof Error ? e.message : 'Could not add this record to your list.' }
  }
  return { error: 'SAVED' }
}

// Manual "Refresh" for the Search tab's own "Incoming Requests" section — same "plain read, not
// queued" reasoning as getBatchPartnersAction above.
export async function listIncomingRecordTransferRequestsAction(partnershipToken: string): Promise<IncomingRecordTransferRequest[]> {
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership) return []
  return listIncomingRecordTransferRequests(supabase, partnership.id)
}

// Approve or decline an incoming "Ask" — re-verifies partnershipToken resolves to the request's
// own holding partnership before acting (never trusts a client-supplied requestId/partnership
// pairing outright).
export async function respondToRecordTransferRequestAction(
  partnershipToken: string,
  requestId: string,
  decision: 'approved' | 'declined'
): Promise<ActionResult> {
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }

  try {
    const result = await resolveRecordTransferRequest(supabase, requestId, partnership.id, decision, partnership.name || 'Unnamed partnership')
    if ('error' in result) return { error: result.error }
  } catch (e) {
    await logError(partnership.congregation_id, 'respondToRecordTransferRequestAction', e)
    return { error: e instanceof Error ? e.message : 'Could not respond to the request.' }
  }
  return { error: 'SAVED' }
}

// Recommends a Plus Code correction on a record the publisher found while searching their own
// locked search area — NOT a record assigned to their partnership (partnershipHasRecord would
// fail here, correctly, since it never was). Instead validates the record's block_id is one of
// THIS partnership's own locked blocks (see 026_partnership_search_blocks.sql) before allowing
// it — same "never trust the client, re-verify against the DB" rule as every other action here.
// Reuses recommendRecordCorrection() unchanged — lands in the Admin's existing Flagged for
// Correction queue, same review gate as the assigned-record correction path above.
export async function recommendSearchScopeCorrectionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = recommendSearchScopeCorrectionSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    recordId: formData.get('recordId'),
    plusCode: formData.get('plusCode'),
    householdMembers: formData.get('householdMembers'),
    reason: formData.get('reason'),
    territoryId: formData.get('territoryId'),
    sectionId: formData.get('sectionId'),
    blockId: formData.get('blockId'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the Plus Code and a reason for the recommendation.' }
  if (!(await checkRateLimit(`tms-recommend-search-correction:${clientIp(await headers())}`, 15))) {
    return { error: 'Too many attempts. Please wait a moment.' }
  }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }

  const scope = await getSearchScopeForPartnership(supabase, partnership.id)
  if (!scope) return { error: 'This assignment has no search area to correct records in.' }
  const record = await getRecordById(supabase, partnership.congregation_id, parsed.data.recordId)
  if (!record || !scope.blocks.some((b) => b.id === record.block_id)) return { error: 'This contact record is not in your search area.' }
  const validScope = await territorySectionBlockBelongsToCongregation(
    supabase,
    partnership.congregation_id,
    parsed.data.territoryId,
    parsed.data.sectionId,
    parsed.data.blockId
  )
  if (!validScope) return { error: 'Choose a valid Barangay, Section, and Block.' }

  try {
    await recommendRecordCorrection(
      supabase,
      partnership.congregation_id,
      parsed.data.recordId,
      {
        plusCode: parsed.data.plusCode,
        reason: parsed.data.reason,
        territoryId: parsed.data.territoryId,
        sectionId: parsed.data.sectionId,
        blockId: parsed.data.blockId,
        householdMembers: parsed.data.householdMembers,
      },
      partnership.name || 'Unnamed partnership'
    )
  } catch (e) {
    await logError(partnership.congregation_id, 'recommendSearchScopeCorrectionAction', e)
    return { error: e instanceof Error ? e.message : 'Could not submit the recommendation.' }
  }

  return { error: 'SAVED' }
}

// An overflow Ministry Partner's one-time, locked-in search-area choice — made after claiming,
// required before they can do anything else (see PublisherWorkspaceApp's gating). Called
// directly (not through the offline sync queue) since it needs a live, real-time answer about
// block availability — same "plain server call, not queued" precedent as
// getSearchScopeRecordsAction's manual Refresh.
export async function chooseSearchScopeAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = chooseSearchScopeSchema.safeParse({
    partnershipToken: formData.get('partnershipToken'),
    sectionId: formData.get('sectionId'),
    blockIds: formData.getAll('blockIds'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please choose a section and at least one block.' }
  if (!(await checkRateLimit(`tms-choose-search-scope:${clientIp(await headers())}`, 10))) {
    return { error: 'Too many attempts. Please wait a moment.' }
  }

  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, parsed.data.partnershipToken)
  if (!partnership) return { error: 'This partnership link is no longer valid.' }
  if (partnership.expired) return { error: 'This assignment has ended for the day.' }
  // Allowed for an overflow partnership, or any partnership with zero assigned records (a
  // batch generated against a brand-new/unmapped territory) — same eligibility rule as
  // PublisherWorkspaceApp's needsSearchScope.
  if (!partnership.batch.is_overflow && partnership.records.length > 0) {
    return { error: 'This assignment does not use a search area.' }
  }

  // One-time only — a partnership that already locked in a scope can never change it (that's
  // the whole point: it's what the overlap-prevention constraint is keyed on).
  const existingScope = await getSearchScopeForPartnership(supabase, partnership.id)
  if (existingScope) return { error: 'You have already chosen your search area for today.' }

  // The section must belong to one of THIS batch's own territories — never trust the
  // client-submitted sectionId outright, same rule as every other parent-id check in this file.
  const { data: section } = await supabase
    .from('territory_sections')
    .select('id, territory_id')
    .eq('congregation_id', partnership.congregation_id)
    .eq('id', parsed.data.sectionId)
    .maybeSingle()
  const batchTerritoryIds = new Set(partnership.territories.map((t) => t.id))
  if (!section || !batchTerritoryIds.has(section.territory_id as string)) return { error: 'Invalid section.' }

  const result = await lockPartnershipSearchBlocks(
    supabase,
    partnership.congregation_id,
    partnership.id,
    parsed.data.sectionId,
    parsed.data.blockIds,
    partnership.batch.assignment_date
  )
  if (!result.ok) return { error: result.error ?? 'Could not save your search area.' }

  revalidatePath(`/tms/assignment/${partnership.batch.access_token}/${partnership.claim_token}`)
  return { error: 'SAVED' }
}
