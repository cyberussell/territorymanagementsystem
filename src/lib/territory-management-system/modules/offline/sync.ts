'use client'

// Replays queued items through the *existing* publisher Server Actions — no new server
// endpoints. Each item that fails (e.g. its partnership/record no longer exists because the
// admin regenerated the assignment) is marked 'failed' and left in the queue rather than
// retried silently or dropped — the confirmed reject-and-flag conflict rule.

import {
  addPublisherRecordAction,
  deletePublisherAddedRecordAction,
  editPublisherAddedRecordAction,
  finishPartnershipAction,
  logPublisherVisitAction,
  movePartnershipRecordAction,
  recommendCorrectionAction,
  recommendMoveAction,
  recommendRemovalAction,
  recommendSearchScopeCorrectionAction,
  renamePartnershipAction,
  sendQuickNoteAction,
  submitPartnershipNoteAction,
  terminatePartnershipEarlyAction,
  updatePublisherRecordAction,
} from '@/app/tms/actions/publisher'
import type { SyncQueueItem } from './db'
import { listQueue, removeFromQueue, updateQueueItem } from './queue'

export interface FlushResult {
  synced: number
  failed: number
  stillPending: number
}

function buildFormData(payload: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(payload)) formData.set(key, value)
  return formData
}

// The Server Action call itself throws (rather than resolving with a result.error) when the
// request never actually reached the server — a genuine network failure, not a business
// rejection. Browsers reject fetch with a plain TypeError for that case ("Failed to fetch" /
// "NetworkError when attempting to fetch resource"), which is otherwise indistinguishable from
// any other thrown error, so it's detected by constructor rather than by parsing the message.
function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError
}

async function executeItem(item: SyncQueueItem): Promise<{ ok: boolean; error?: string }> {
  const formData = buildFormData(item.payload)
  let result: { error?: string }
  if (item.type === 'rename') result = await renamePartnershipAction({}, formData)
  else if (item.type === 'visit') result = await logPublisherVisitAction({}, formData)
  else if (item.type === 'addRecord') result = await addPublisherRecordAction({}, formData)
  else if (item.type === 'moveRecord') result = await movePartnershipRecordAction({}, formData)
  else if (item.type === 'note') result = await submitPartnershipNoteAction({}, formData)
  else if (item.type === 'updateRecord') result = await updatePublisherRecordAction({}, formData)
  else if (item.type === 'recommendRemoval') result = await recommendRemovalAction({}, formData)
  else if (item.type === 'finish') result = await finishPartnershipAction({}, formData)
  else if (item.type === 'deleteAddedRecord') result = await deletePublisherAddedRecordAction({}, formData)
  else if (item.type === 'editAddedRecord') result = await editPublisherAddedRecordAction({}, formData)
  else if (item.type === 'recommendCorrection') result = await recommendCorrectionAction({}, formData)
  else if (item.type === 'recommendSearchScopeCorrection') result = await recommendSearchScopeCorrectionAction({}, formData)
  else if (item.type === 'recommendMove') result = await recommendMoveAction({}, formData)
  else if (item.type === 'quickNote') result = await sendQuickNoteAction({}, formData)
  else result = await terminatePartnershipEarlyAction({}, formData)

  // 'SAVED' is this codebase's success sentinel (see useServerAction) — everything else in
  // result.error is a real failure.
  if (result.error && result.error !== 'SAVED') return { ok: false, error: result.error }
  return { ok: true }
}

export async function flushQueue(partnershipToken: string): Promise<FlushResult> {
  const items = await listQueue(partnershipToken)
  let synced = 0
  let failed = 0
  let stillPending = 0

  for (const item of items) {
    if (item.status === 'syncing') continue
    await updateQueueItem(item.id, { status: 'syncing' })
    try {
      const { ok, error } = await executeItem(item)
      if (ok) {
        await removeFromQueue(item.id)
        synced += 1
      } else {
        // A real rejection from the server (e.g. the admin regenerated the assignment and
        // this record/partnership no longer exists) — surface it and stop auto-retrying.
        await updateQueueItem(item.id, { status: 'failed', error })
        failed += 1
      }
    } catch (e) {
      if (isNetworkError(e)) {
        // Connectivity dropped mid-sync (or the initial online-status read was stale) — this
        // isn't a rejection, it's a "try again later." Revert to 'pending' so it retries
        // silently on the next sync instead of alarming the publisher with a false "failed."
        await updateQueueItem(item.id, { status: 'pending' })
        stillPending += 1
      } else {
        await updateQueueItem(item.id, { status: 'failed', error: e instanceof Error ? e.message : 'Sync failed.' })
        failed += 1
      }
    }
  }

  return { synced, failed, stillPending }
}
