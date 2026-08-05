'use client'

import { getDb, type SyncQueueItem, type SyncQueueItemType } from './db'

export async function enqueue(
  partnershipToken: string,
  type: SyncQueueItemType,
  payload: Record<string, string>
): Promise<SyncQueueItem> {
  const db = await getDb()
  const item: SyncQueueItem = {
    id: crypto.randomUUID(),
    partnershipToken,
    type,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  await db.put('syncQueue', item)
  return item
}

export async function listQueue(partnershipToken: string): Promise<SyncQueueItem[]> {
  const db = await getDb()
  const items = await db.getAllFromIndex('syncQueue', 'by-partnership', partnershipToken)
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('syncQueue', id)
}

export async function updateQueueItem(id: string, updates: Partial<SyncQueueItem>): Promise<void> {
  const db = await getDb()
  const existing = await db.get('syncQueue', id)
  if (!existing) return
  await db.put('syncQueue', { ...existing, ...updates })
}
