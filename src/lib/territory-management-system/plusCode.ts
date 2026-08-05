'use client'

import { OpenLocationCode } from 'open-location-code'

const openLocationCode = new OpenLocationCode()

// A full (unshortened) Open Location Code — e.g. "6PH57VP3+PQ" — always resolves correctly on
// its own, unlike a shortened local code ("7FG8+4V"), which needs a nearby reference locality to
// stay unambiguous. Simpler and safer to always generate the full form here.
function encodePlusCode(latitude: number, longitude: number): string {
  return openLocationCode.encode(latitude, longitude)
}

export type LocatePlusCodeResult = { code: string } | { error: string }

// Wraps the browser Geolocation API + local (no network call, no API key) Plus Code encoding
// into one call a form's "Use My Location" button can await. Resolves with a friendly error
// message instead of throwing — every failure mode here (unsupported browser, denied
// permission, GPS timeout) is a normal, expected outcome a publisher standing at a door will
// hit sometimes, not an exceptional one.
export function locatePlusCode(): Promise<LocatePlusCodeResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ error: 'Location is not supported on this device/browser.' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ code: encodePlusCode(position.coords.latitude, position.coords.longitude) })
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. You can still enter the Plus Code manually.'
            : 'Could not get your location. You can still enter the Plus Code manually.'
        resolve({ error: message })
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  })
}
