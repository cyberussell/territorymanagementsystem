'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { localDatetimeToUtcIso } from '@/lib/territory-management-system/modules/assignment/date'
import {
  createRecordSchema,
  getSelectableResults,
  logVisitSchema,
  mergeConductorIntoNotes,
  updateRecordSchema,
} from '@/lib/territory-management-system/modules/records/schema'
import * as recordQueries from '@/lib/territory-management-system/modules/records/queries'
import { parseRecordsCsv } from '@/lib/territory-management-system/modules/records/csv'
import type { HeaderMap } from '@/lib/territory-management-system/modules/records/csvShared'
import { getTerritoryStructure, listTerritories } from '@/lib/territory-management-system/modules/territory/queries'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import { type ActionResult } from './shared'

export async function createRecordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = createRecordSchema.safeParse({
    territoryId: formData.get('territoryId'),
    sectionId: formData.get('sectionId'),
    blockId: formData.get('blockId'),
    address: formData.get('address'),
    unit: formData.get('unit'),
    residentName: formData.get('residentName'),
    plusCode: formData.get('plusCode'),
    householdMembers: formData.get('householdMembers'),
    notes: formData.get('notes'),
    doNotCall: formData.get('doNotCall'),
    initialResult: formData.get('initialResult'),
    initialConductorName: formData.get('initialConductorName'),
    initialNotes: formData.get('initialNotes'),
    initialPartnerName: formData.get('initialPartnerName'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the required fields.' }

  const { supabase, congregation, userId, userName } = await requireAdmin()

  // RLS only checks that congregation_id on the new row belongs to the caller — it never
  // verifies the territoryId/sectionId/blockId in the (client-editable) hidden form fields
  // actually belong to that same congregation. Confirm the whole chain resolves within the
  // admin's own territory tree before writing, same check already required for the
  // publisher's equivalent (RLS-free) path in actions/publisher.ts.
  const territory = await getTerritoryStructure(supabase, congregation.id, parsed.data.territoryId)
  const section = territory?.sections.find((s) => s.id === parsed.data.sectionId)
  const block = section?.blocks.find((b) => b.id === parsed.data.blockId)
  if (!territory || !section || !block) return { error: 'Invalid territory, section, or block.' }

  // A blank initialResult here re-derives the full SELECTABLE_VISIT_RESULTS list (a fresh
  // record has no prior visit and is never do_not_call yet), same re-validation pattern
  // logVisitAction already applies rather than trusting the submitted value outright.
  if (parsed.data.initialResult && !(getSelectableResults() as readonly string[]).includes(parsed.data.initialResult)) {
    return { error: 'Invalid initial status.' }
  }

  try {
    const record = await recordQueries.createRecord(supabase, congregation.id, {
      ...parsed.data,
      addedByAdminId: userId,
      historyActor: { role: 'admin', name: userName },
    })
    if (parsed.data.initialResult) {
      await recordQueries.logVisit(supabase, congregation.id, {
        recordId: record.id,
        visitedAt: new Date().toISOString(),
        result: parsed.data.initialResult,
        notes: mergeConductorIntoNotes(parsed.data.initialConductorName, parsed.data.initialNotes),
        createdBy: userId,
        partnerName: parsed.data.initialPartnerName.trim() || null,
      })
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create the contact record.' }
  }

  revalidatePath('/tms/dashboard/records')
  revalidatePath(`/tms/dashboard/territories/${parsed.data.territoryId}`)
  return { error: 'SAVED' }
}

export async function updateRecordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = updateRecordSchema.safeParse({
    recordId: formData.get('recordId'),
    address: formData.get('address'),
    unit: formData.get('unit'),
    residentName: formData.get('residentName'),
    plusCode: formData.get('plusCode'),
    householdMembers: formData.get('householdMembers'),
    notes: formData.get('notes'),
    doNotCall: formData.get('doNotCall'),
  })
  if (!parsed.success) return { error: 'Please fill in the required fields.' }
  const { recordId, ...updates } = parsed.data

  const { supabase, congregation, userId, userName } = await requireAdmin()
  try {
    await recordQueries.updateRecord(supabase, congregation.id, recordId, {
      ...updates,
      editedByAdminId: userId,
      historyActor: { role: 'admin', name: userName },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update the contact record.' }
  }

  revalidatePath(`/tms/dashboard/records/${recordId}`)
  return { error: 'SAVED' }
}

export async function deleteRecordAction(recordId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await recordQueries.deleteRecord(supabase, recordId)
  revalidatePath('/tms/dashboard/records')
  revalidatePath('/tms/dashboard/records/flagged')
}

export async function approveRecordAction(recordId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await recordQueries.setRecordStatus(supabase, recordId, 'approved')
  revalidatePath('/tms/dashboard/records')
  revalidatePath(`/tms/dashboard/records/${recordId}`)
}

// "Reject" a pending CSV-imported record = delete it — there's no other state for a
// rejected row to sit in, and leaving it around unresolved would strand rows the admin
// already decided not to use.
export async function rejectRecordAction(recordId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await recordQueries.deleteRecord(supabase, recordId)
  revalidatePath('/tms/dashboard/records')
}

// Generic "Undo Last Visit" — not limited to Bible Study mis-tags, since the underlying
// mechanism (delete the most recent visit row) is the same for any wrong status a publisher
// or admin logged.
export async function undoLastVisitAction(recordId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await recordQueries.deleteLatestVisit(supabase, recordId)
  revalidatePath(`/tms/dashboard/records/${recordId}`)
}

// Admin corrects the result/notes of a record's latest logged visit in place — see
// overrideLatestVisit (records/queries.ts) for why this is distinct from Undo or logging a
// fresh visit. Re-validates result against getSelectableResults() same as logVisitAction, even
// though the UI only ever offers that same set — defense in depth against a crafted submission.
export async function overrideLatestVisitAction(recordId: string, result: string, notes: string): Promise<{ error: string } | { error: 'SAVED' }> {
  if (!(getSelectableResults() as readonly string[]).includes(result)) return { error: 'Invalid status.' }
  const { supabase } = await requireAdmin()
  try {
    await recordQueries.overrideLatestVisit(supabase, recordId, result, notes)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save the override.' }
  }
  revalidatePath(`/tms/dashboard/records/${recordId}`)
  return { error: 'SAVED' }
}

// Admin dismisses a publisher's "Recommend for Admin Removal" without deleting the record —
// clears it off the Flagged for Removal list.
export async function dismissRemovalRecommendationAction(recordId: string): Promise<void> {
  const { supabase, congregation, userName } = await requireAdmin()
  await recordQueries.dismissRemovalRecommendation(supabase, congregation.id, recordId, userName)
  revalidatePath('/tms/dashboard/records/flagged')
}

// Admin dismisses a single visit's note off the Weekly Notes list — see dismissWeeklyNote
// (records/queries.ts) for why this only hides the note there and leaves the record's actual
// Visit History/Override/Undo untouched.
export async function dismissWeeklyNoteAction(visitId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await recordQueries.dismissWeeklyNote(supabase, visitId)
  revalidatePath('/tms/dashboard/weekly-notes')
}

// Admin applies a publisher's "Update" (correction) recommendation — writes the recommended
// Plus Code onto the record and clears the flag.
export async function applyRecordCorrectionAction(recordId: string): Promise<void> {
  const { supabase, congregation, userName } = await requireAdmin()
  await recordQueries.applyRecordCorrection(supabase, congregation.id, recordId, userName)
  revalidatePath('/tms/dashboard/records/flagged')
  revalidatePath(`/tms/dashboard/records/${recordId}`)
}

// Admin dismisses a correction recommendation without applying it — clears the flag, leaves
// the record's own Plus Code untouched.
export async function dismissCorrectionRecommendationAction(recordId: string): Promise<void> {
  const { supabase, congregation, userName } = await requireAdmin()
  await recordQueries.dismissCorrectionRecommendation(supabase, congregation.id, recordId, userName)
  revalidatePath('/tms/dashboard/records/flagged')
}

// Admin applies a publisher's "Recommend New Location" (move) recommendation — writes the
// recommended address/unit/plus_code/household_members onto the record and clears the flag.
export async function applyRecordMoveAction(recordId: string): Promise<void> {
  const { supabase, congregation, userName } = await requireAdmin()
  await recordQueries.applyRecordMove(supabase, congregation.id, recordId, userName)
  revalidatePath('/tms/dashboard/records/flagged')
  revalidatePath(`/tms/dashboard/records/${recordId}`)
}

// Admin dismisses a move recommendation without applying it — clears the flag, leaves the
// record's own address/unit/plus_code/household_members untouched.
export async function dismissMoveRecommendationAction(recordId: string): Promise<void> {
  const { supabase, congregation, userName } = await requireAdmin()
  await recordQueries.dismissMoveRecommendation(supabase, congregation.id, recordId, userName)
  revalidatePath('/tms/dashboard/records/flagged')
}

// Pulls a record out of assignment-generation eligibility (fetchEligibleRecordIds only selects
// status = 'approved') while the Admin investigates a flagged recommendation — independent of
// applying/dismissing the recommendation itself. Same status field/flip as approveRecordAction
// above, just the other direction.
export async function markRecordPendingAction(recordId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await recordQueries.setRecordStatus(supabase, recordId, 'pending')
  revalidatePath('/tms/dashboard/records/flagged')
  revalidatePath('/tms/dashboard/records')
  revalidatePath(`/tms/dashboard/records/${recordId}`)
}

export async function logVisitAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = logVisitSchema.safeParse({
    recordId: formData.get('recordId'),
    visitedAt: formData.get('visitedAt'),
    result: formData.get('result'),
    conductorName: formData.get('conductorName'),
    notes: formData.get('notes'),
    partnerName: formData.get('partnerName'),
  })
  if (!parsed.success) {
    const notesIssue = parsed.error.issues.find((i) => i.path.includes('notes'))
    const conductorIssue = parsed.error.issues.find((i) => i.path.includes('conductorName'))
    return { error: notesIssue?.message ?? conductorIssue?.message ?? 'Please fill in the visit details correctly.' }
  }

  const { supabase, congregation, userId } = await requireAdmin()

  // Same narrowing the admin's own VisitLogForm applies client-side (Bible Study follow-up /
  // Do Not Call) — re-derived server-side so a stale or crafted form submission can't log a
  // result outside what's actually valid for this record's current state.
  const [latestResult, { doNotCall }] = await Promise.all([
    recordQueries.getLatestVisitResult(supabase, parsed.data.recordId),
    recordQueries.getRecordDoNotCall(supabase, parsed.data.recordId),
  ])
  const selectable = getSelectableResults(latestResult, doNotCall)
  if (!(selectable as readonly string[]).includes(parsed.data.result)) return { error: 'Invalid visit result.' }

  try {
    await recordQueries.logVisit(supabase, congregation.id, {
      recordId: parsed.data.recordId,
      visitedAt: localDatetimeToUtcIso(parsed.data.visitedAt, congregation.timezone),
      result: parsed.data.result,
      notes: mergeConductorIntoNotes(parsed.data.conductorName, parsed.data.notes),
      createdBy: userId,
      partnerName: parsed.data.partnerName.trim() || null,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not log the visit.' }
  }

  revalidatePath(`/tms/dashboard/records/${parsed.data.recordId}`)
  return { error: 'SAVED' }
}

export interface ImportSummary {
  imported: number
  errors: string[]
}

// territoryId is passed when launched from a specific Territory's page (every row lands in
// that territory, a Territory Name column if present is ignored) and null when launched from
// the global Records page (every row names its own territory via Territory Name, resolved by
// case-insensitive exact match against this congregation's territories — same matching rule
// already used for Section/Block below).
export async function importRecordsAction(
  territoryId: string | null,
  csvText: string,
  headerMap?: HeaderMap
): Promise<ImportSummary> {
  const { supabase, congregation } = await requireAdmin()
  const { rows, errors } = parseRecordsCsv(csvText, { requireTerritoryName: territoryId === null, headerMap })

  const structureCache = new Map<string, TerritoryStructure>()
  const territoryIdByName = new Map<string, string>()
  if (territoryId) {
    const structure = await getTerritoryStructure(supabase, congregation.id, territoryId)
    if (!structure) return { imported: 0, errors: ['Territory not found.'] }
    structureCache.set(territoryId, structure)
  } else {
    const territories = await listTerritories(supabase, congregation.id)
    for (const t of territories) territoryIdByName.set(t.name.toLowerCase(), t.id)
  }

  const resolvedRows: Parameters<typeof recordQueries.importRecords>[2] = []
  const resolutionErrors: string[] = []
  const touchedTerritoryIds = new Set<string>()

  for (const [index, row] of rows.entries()) {
    const rowNum = index + 2
    let rowTerritoryId = territoryId

    if (!rowTerritoryId) {
      const matchId = territoryIdByName.get(row.territoryName.toLowerCase())
      if (!matchId) {
        resolutionErrors.push(`Row ${rowNum}: no territory named "${row.territoryName}".`)
        continue
      }
      rowTerritoryId = matchId
    }

    let structure = structureCache.get(rowTerritoryId)
    if (!structure) {
      const fetched = await getTerritoryStructure(supabase, congregation.id, rowTerritoryId)
      if (!fetched) {
        resolutionErrors.push(`Row ${rowNum}: territory not found.`)
        continue
      }
      structure = fetched
      structureCache.set(rowTerritoryId, structure)
    }

    const section = structure.sections.find((s) => s.label.toLowerCase() === row.section.toLowerCase())
    if (!section) {
      resolutionErrors.push(`Row ${rowNum}: no section "${row.section}" in territory "${structure.name}".`)
      continue
    }
    const block = section.blocks.find((b) => b.label.toLowerCase() === row.block.toLowerCase())
    if (!block) {
      resolutionErrors.push(`Row ${rowNum}: no block "${row.block}" in section "${row.section}".`)
      continue
    }

    touchedTerritoryIds.add(rowTerritoryId)
    resolvedRows.push({
      territoryId: rowTerritoryId,
      sectionId: section.id,
      blockId: block.id,
      address: row.address,
      // Unit and Do Not Call are no longer importable columns — every CSV-imported row starts
      // with no unit and do_not_call unset; both stay editable afterward like any other record.
      unit: '',
      residentName: row.residentName,
      plusCode: row.plusCode,
      householdMembers: row.householdMembers,
      notes: row.notes,
      doNotCall: false,
    })
  }

  const allErrors = [...errors, ...resolutionErrors]
  if (resolvedRows.length === 0) return { imported: 0, errors: allErrors }

  const imported = await recordQueries.importRecords(supabase, congregation.id, resolvedRows)
  revalidatePath('/tms/dashboard/records')
  for (const id of touchedTerritoryIds) revalidatePath(`/tms/dashboard/territories/${id}`)
  return { imported, errors: allErrors }
}
