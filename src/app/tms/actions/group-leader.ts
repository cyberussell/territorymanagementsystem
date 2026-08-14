'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireGroupLeader } from '@/lib/territory-management-system/modules/auth/queries'
import { createAssignmentSchema } from '@/lib/territory-management-system/modules/assignment/schema'
import {
  addPartnershipToBatch,
  cancelRecordAssignmentOffer,
  createAssignment,
  createRecordAssignmentOffer,
  deleteBatch,
  getBatchById,
  getBatchesForGroupLeaderAndDate,
  getPartnershipAssignedRecordSummaries,
  getPartnershipById,
  terminatePartnershipEarly,
  type PartnershipAssignedRecordSummary,
} from '@/lib/territory-management-system/modules/assignment/queries'
import { todayInTimezone } from '@/lib/territory-management-system/modules/assignment/date'
import { isAssignmentError } from '@/lib/territory-management-system/modules/assignment/engine'
import { type ActionResult } from './shared'

// Assignment generation moved from Admin to Group Leader (Russell's call — the "campaign day,
// many publishers, decide fast" scenario belongs to whoever's coordinating the field ministry
// that day, not whoever configures territories). RLS backs this up independently (migration
// 004): the admin session client can no longer write to these 4 tables even if some old UI
// path tried to.
//
// Multiple Group Leaders can each run their own concurrent batch the same day
// (013_group_leader_assignment_ownership.sql) — "existing batch" below means MY existing batch,
// never another Group Leader's, and createAssignment independently rejects any territory
// another Group Leader's active batch already covers today.

// If a batch already exists for today, the client-side form asks the Group Leader to confirm
// before ever submitting — by the time this runs, that confirmation has already happened, so
// it's safe to just replace it. "Replace" now means deleting EVERY one of today's batches for
// this Group Leader (not just one) — a Group Leader can have more than one today via the
// overflow-assignment path below, and this form's own copy ("generating a new one replaces it")
// still means "start completely fresh," not "replace one of several arbitrarily."
export async function createGroupLeaderAssignmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = createAssignmentSchema.safeParse({
    territoryIds: formData.getAll('territoryIds'),
    partnershipCount: formData.get('partnershipCount'),
    maxPerPartnership: formData.get('maxPerPartnership') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the form correctly.' }

  const { supabase, congregation, userId } = await requireGroupLeader()
  const assignmentDate = todayInTimezone(congregation.timezone)

  const existing = await getBatchesForGroupLeaderAndDate(supabase, congregation.id, userId, assignmentDate)
  for (const batch of existing) await deleteBatch(supabase, batch.id)

  const result = await createAssignment(supabase, congregation.id, {
    territoryIds: parsed.data.territoryIds,
    partnershipCount: parsed.data.partnershipCount,
    maxPerPartnership: parsed.data.maxPerPartnership,
    assignmentDate,
    createdBy: userId,
  })
  if (isAssignmentError(result)) return { error: result.error }

  revalidatePath('/tms/group-leader/dashboard')
  redirect('/tms/group-leader/dashboard')
}

// Generates an additional, independent batch for a Group Leader who already has one today —
// the "too many publishers for one territory" scenario. Never deletes anything (unlike the
// regenerate action above): the original batch and every partnership already claimed under it
// stays exactly as-is. Every partnership here is created with zero records regardless of what's
// technically still unassigned in the territory (createAssignment's forceZeroRecords) — this is
// deliberately a "go canvass/search" batch, not a second bite at the same eligible-record pool,
// so it can never end up double-assigning an address someone else is already working today.
export async function createOverflowAssignmentAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = createAssignmentSchema.safeParse({
    territoryIds: formData.getAll('territoryIds'),
    partnershipCount: formData.get('partnershipCount'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the form correctly.' }

  const { supabase, congregation, userId } = await requireGroupLeader()
  const assignmentDate = todayInTimezone(congregation.timezone)

  // The client-side picker only ever shows territories this Group Leader already has an active
  // batch on today, but this is a public-facing mutation reached from ordinary form fields —
  // re-verify server-side rather than trusting the submitted territoryIds outright, same rule
  // this codebase applies everywhere a client picks from a constrained list.
  const existingBatches = await getBatchesForGroupLeaderAndDate(supabase, congregation.id, userId, assignmentDate)
  if (existingBatches.length === 0) return { error: 'Generate today’s first assignment before adding an overflow one.' }
  const { data: territoryLinks } = await supabase
    .from('assignment_batch_territories')
    .select('territory_id')
    .in(
      'batch_id',
      existingBatches.map((b) => b.id)
    )
  const todaysTerritoryIds = new Set((territoryLinks ?? []).map((l) => l.territory_id as string))
  const invalid = parsed.data.territoryIds.filter((id) => !todaysTerritoryIds.has(id))
  if (invalid.length > 0) return { error: 'Choose a territory already assigned today.' }

  const result = await createAssignment(supabase, congregation.id, {
    territoryIds: parsed.data.territoryIds,
    partnershipCount: parsed.data.partnershipCount,
    assignmentDate,
    createdBy: userId,
    forceZeroRecords: true,
  })
  if (isAssignmentError(result)) return { error: result.error }

  revalidatePath('/tms/group-leader/dashboard')
  redirect('/tms/group-leader/dashboard')
}

export async function deleteGroupLeaderAssignmentAction(batchId: string): Promise<void> {
  const { supabase, userId } = await requireGroupLeader()
  // RLS already blocks deleting a batch created_by someone else — this app-side check is
  // defense in depth (same "always independently re-verify, don't rely on RLS alone" rule this
  // codebase follows everywhere else) and avoids a silent, unexplained no-op if it's ever hit.
  // A batch created before 013_group_leader_assignment_ownership.sql has created_by = null
  // (no way to know who made it retroactively) — treated as legacy/unowned, manageable by any
  // Group Leader, same as 014_legacy_batch_ownership_fix.sql's matching RLS carve-out.
  const { data: batch } = await supabase.from('assignment_batches').select('created_by').eq('id', batchId).maybeSingle()
  if (batch && (batch.created_by === userId || batch.created_by === null)) await deleteBatch(supabase, batchId)
  revalidatePath('/tms/group-leader/dashboard')
  redirect('/tms/group-leader/dashboard')
}

// Lets a Group Leader force-end any Ministry Partner's session directly from the Partners tab —
// same terminatePartnershipEarly() a publisher's own "End My Ministry Early" calls, just
// triggered by whoever's coordinating the day instead of the pair themselves (e.g. a pair went
// quiet, or it's time to wrap up the whole batch). Deliberately no redirect (unlike the actions
// above) — this is called from within the Partners tab's own client state, and a redirect would
// reset GroupLeaderTabs back to the Home tab; revalidatePath alone refreshes the underlying data
// in place.
export async function endPartnershipAction(partnershipId: string): Promise<void> {
  const { supabase, userId } = await requireGroupLeader()
  // Same "never rely on RLS alone" re-verification as deleteGroupLeaderAssignmentAction above —
  // trace the partnership back to a batch this Group Leader created (or a legacy, creator-less
  // batch, manageable by any Group Leader) before terminating it.
  const { data: partnership } = await supabase.from('partnerships').select('id, batch_id').eq('id', partnershipId).maybeSingle()
  if (partnership) {
    const { data: batch } = await supabase.from('assignment_batches').select('created_by').eq('id', partnership.batch_id).maybeSingle()
    if (batch && (batch.created_by === userId || batch.created_by === null)) {
      await terminatePartnershipEarly(supabase, partnershipId)
    }
  }
  revalidatePath('/tms/group-leader/dashboard')
}

// Lazy-loaded when a Group Leader taps a partnership card in the Partners tab (see
// PartnershipList.tsx's accordion) — read-only, congregation-scoped by the session client's own
// RLS (group_leader has read-only policies across every table, see 003_group_leader_and_reports.sql),
// same as every other stat already shown on this tab. Deliberately not gated to "batches I
// created" like the mutations above — reading who's assigned to a partner isn't a write, and RLS
// already keeps this scoped to the Group Leader's own congregation.
export async function getPartnershipAssignedRecordsAction(partnershipId: string): Promise<PartnershipAssignedRecordSummary[]> {
  const { supabase } = await requireGroupLeader()
  return getPartnershipAssignedRecordSummaries(supabase, partnershipId)
}

// Offers one still-unassigned contact record (a gray pin on the Map tab) to a specific Ministry
// Partner — the manual complement to the bulk assignment engine, for whatever
// calculateAssignment left over past a partnership's maxPerPartnership cap, or a fresh
// zero-record overflow territory nobody's claimed into yet. Works for a partnership from either
// kind of batch today (House To House or Auxiliary/overflow) — createRecordAssignmentOffer never
// restricts by group type, since an unassigned record has no current holder to "poach" from.
// Deliberately NOT an instant assignment (confirmed with Russell): the target partnership must
// accept or decline before it actually attaches — see createRecordAssignmentOffer/
// resolveRecordAssignmentOffer. Same "never rely on RLS alone" ownership re-check as
// endPartnershipAction/deleteGroupLeaderAssignmentAction: the destination partnership must belong
// to a batch this Group Leader owns today (or a legacy, creator-less batch).
export async function offerRecordToPartnershipAction(recordId: string, partnershipId: string): Promise<{ error?: string }> {
  const { supabase, congregation, userId } = await requireGroupLeader()
  const partnership = await getPartnershipById(supabase, partnershipId)
  if (!partnership) return { error: 'Ministry partner not found.' }
  const batch = await getBatchById(supabase, partnership.batch_id)
  if (!batch || (batch.created_by !== userId && batch.created_by !== null)) {
    return { error: 'You can only offer records to your own ministry partners.' }
  }

  const result = await createRecordAssignmentOffer(supabase, congregation.id, recordId, partnershipId, userId)
  if ('error' in result) return { error: result.error }
  revalidatePath('/tms/group-leader/dashboard')
  return {}
}

// Withdraws a still-pending offer from the Map tab — e.g. the Group Leader changed their mind
// about who to offer a record to before the partner responded. No ownership re-check needed
// beyond RLS itself (group_leader's "manage" policy on record_assignment_offers is already
// congregation-scoped, see 043_record_assignment_offers.sql) — unlike the mutations above, this
// isn't reaching into another table (partnerships/assignment_batches) with its own separate
// ownership model to re-verify.
export async function cancelRecordAssignmentOfferAction(offerId: string): Promise<void> {
  const { supabase } = await requireGroupLeader()
  await cancelRecordAssignmentOffer(supabase, offerId)
  revalidatePath('/tms/group-leader/dashboard')
}

// Manually adds one more Ministry Partner to an already-generated House To House batch —
// confirmed with Russell: only while the territory still has unassigned households
// (addPartnershipToBatch re-verifies and errors otherwise, telling the Group Leader to generate
// a Language Searcher group instead, since that's the right move once nothing's left to hand a
// House To House partner). Same "never rely on RLS alone" ownership re-check as
// offerRecordToPartnershipAction above.
export async function addPartnershipAction(batchId: string): Promise<{ error?: string }> {
  const { supabase, congregation, userId } = await requireGroupLeader()
  const batch = await getBatchById(supabase, batchId)
  if (!batch || (batch.created_by !== userId && batch.created_by !== null)) {
    return { error: 'You can only add a partner to your own assignment.' }
  }
  if (batch.is_overflow) {
    return { error: 'Language Searcher groups already start empty — generate a new one from the Home tab instead.' }
  }

  const result = await addPartnershipToBatch(supabase, congregation.id, batchId)
  if ('error' in result) return { error: result.error }
  revalidatePath('/tms/group-leader/dashboard')
  return {}
}
