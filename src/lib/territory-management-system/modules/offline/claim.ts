'use client'

// Tracks which ONE partnership this device is bound to for a given batch — a publisher can
// claim (name) at most one Ministry Partner per assignment, and after that every other
// partnership under the same batch opens read-only from this device. Deliberately plain
// localStorage, not IndexedDB: a single small string, read synchronously, no offline queue
// semantics needed. Scoped per batch token so it naturally resets once a new day's batch (and
// therefore a new QR code) replaces the old one.
function storageKey(batchToken: string): string {
  return `tms_claim_${batchToken}`
}

export function getClaimedPartnershipToken(batchToken: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(storageKey(batchToken))
}

export function setClaimedPartnershipToken(batchToken: string, partnershipToken: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey(batchToken), partnershipToken)
}

// Un-binds this device from its claimed partnership — used when a publisher "releases" their
// partnership (a change of mind before any real work, see releasePartnershipAction), so this
// same device can claim a different one (or the same one again) fresh, and isn't stuck reading
// it as read-only forever.
export function clearClaimedPartnershipToken(batchToken: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(storageKey(batchToken))
}
