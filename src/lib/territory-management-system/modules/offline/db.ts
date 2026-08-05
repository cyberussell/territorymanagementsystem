'use client'

// Browser-only IndexedDB layer for the Offline Mode publisher experience. Structured, decent-
// capacity local storage (cached map image blobs, a growing sync queue) is what "Local
// storage" means here — IndexedDB via the small `idb` wrapper, not the 5-10MB string-only
// localStorage API.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

const DB_NAME = 'tms-offline'
const DB_VERSION = 1

export type SyncQueueItemType =
  | 'rename'
  | 'visit'
  | 'addRecord'
  | 'terminate'
  | 'moveRecord'
  | 'note'
  | 'updateRecord'
  | 'recommendRemoval'
  | 'finish'
  | 'deleteAddedRecord'
  | 'editAddedRecord'
  | 'recommendCorrection'
  | 'recommendSearchScopeCorrection'
  | 'recommendMove'
  | 'quickNote'
export type SyncQueueItemStatus = 'pending' | 'syncing' | 'failed'

export interface SyncQueueItem {
  id: string
  partnershipToken: string
  type: SyncQueueItemType
  payload: Record<string, string>
  createdAt: string
  status: SyncQueueItemStatus
  error?: string
}

interface TmsOfflineDB extends DBSchema {
  // A lightweight "has this partnership been downloaded" marker — not a full data snapshot.
  // Rendering always comes from React state seeded by the server on load (see
  // PublisherWorkspaceApp); without a service worker a full page reload needs network
  // regardless, so caching the whole workspace JSON for a "reload while offline" case that can
  // never actually be reached would just be dead weight.
  downloads: {
    key: string
    value: { partnershipToken: string; downloadedAt: string }
  }
  mapImages: {
    key: string
    value: { territoryId: string; blob: Blob }
  }
  syncQueue: {
    key: string
    value: SyncQueueItem
    indexes: { 'by-partnership': string }
  }
}

let dbPromise: Promise<IDBPDatabase<TmsOfflineDB>> | null = null

export function getDb(): Promise<IDBPDatabase<TmsOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TmsOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('downloads', { keyPath: 'partnershipToken' })
        db.createObjectStore('mapImages', { keyPath: 'territoryId' })
        const queueStore = db.createObjectStore('syncQueue', { keyPath: 'id' })
        queueStore.createIndex('by-partnership', 'partnershipToken')
      },
    })
  }
  return dbPromise
}
