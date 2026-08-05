'use client'

import { getDb } from './db'
import type { PartnershipWorkspace } from '../assignment/types'

// The explicit, visible "Download Assignment" step — caches every referenced territory map as
// a Blob so it's available with zero network for the rest of the day, and records that this
// partnership has been downloaded. Not silently done on page load: the publisher needs to
// *see* this succeed before heading into the field with no signal.
export async function downloadAssignment(partnershipToken: string, data: PartnershipWorkspace): Promise<void> {
  const db = await getDb()
  await db.put('downloads', { partnershipToken, downloadedAt: new Date().toISOString() })

  await Promise.all(
    data.territories
      .filter((t): t is typeof t & { map_image_url: string } => !!t.map_image_url)
      .map(async (t) => {
        try {
          const response = await fetch(t.map_image_url)
          const blob = await response.blob()
          await db.put('mapImages', { territoryId: t.id, blob })
        } catch {
          // Non-fatal — that territory's map just won't render offline; records, visits, and
          // notes are unaffected.
        }
      })
  )
}

export async function isDownloaded(partnershipToken: string): Promise<boolean> {
  const db = await getDb()
  const row = await db.get('downloads', partnershipToken)
  return !!row
}

export async function getLocalMapImageUrl(territoryId: string): Promise<string | null> {
  const db = await getDb()
  const row = await db.get('mapImages', territoryId)
  if (!row) return null
  return URL.createObjectURL(row.blob)
}
