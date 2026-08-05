'use client'

import { useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { OpenLocationCode } from 'open-location-code'
import type { RecordLocation } from '@/lib/territory-management-system/modules/reports/queries'
import Card from '@/components/territory-management-system/dashboard/Card'
import 'leaflet/dist/leaflet.css'

// Leaflet's default marker icon references image files by a relative path that breaks under
// most bundlers (including Next.js) — the standard workaround is pointing it at a CDN copy of
// the same icon images leaflet itself ships, rather than trying to bundle them locally.
const blueMarkerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// Red variant — used to distinguish a publisher's own newly-added (still pending Admin
// approval) records from existing/pre-assigned ones on the overflow search-area map. A small
// inline SVG data URI rather than a second CDN image: this codebase already leans on unpkg for
// the default blue marker, and a color swap doesn't justify a second, less-maintained external
// asset source — same geometry as the blue marker above so both align identically on the map.
const redMarkerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
  <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5s12.5-19.1 12.5-28.5C25 5.6 19.4 0 12.5 0z" fill="#DC2626" stroke="#7F1D1D" stroke-width="1"/>
  <circle cx="12.5" cy="12.5" r="5" fill="#FFFFFF"/>
</svg>`
const redMarkerIcon = L.icon({
  iconUrl: `data:image/svg+xml,${encodeURIComponent(redMarkerSvg)}`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

const openLocationCode = new OpenLocationCode()

interface Pin {
  id: string
  lat: number
  lng: number
  address: string
  residentName: string
  plusCode: string
  territoryName: string
  color: 'blue' | 'red'
}

function toPin(r: RecordLocation & { color?: 'blue' | 'red' }, code: string): Pin {
  const area = openLocationCode.decode(code)
  return {
    id: r.id,
    lat: area.latitudeCenter,
    lng: area.longitudeCenter,
    address: r.address,
    residentName: r.residentName,
    plusCode: r.plusCode,
    territoryName: r.territoryName,
    color: r.color ?? 'blue',
  }
}

// Decoding happens entirely client-side (no geocoding API, no network call) — the same
// open-location-code package lib/plusCode.ts already uses to encode a GPS position into a Plus
// Code decodes one back into a lat/lng center point just as easily. Most manually-typed or
// older CSV-imported Plus Codes are SHORT/local-form (e.g. "5JJ6+F8", missing their leading
// area digits, since that's what a publisher realistically types at the door) — only codes
// captured via the "Use My Location" button are full-form. A short code alone can't be decoded
// standalone; it needs a nearby reference point. Two-pass: decode every full code directly,
// then use their average position (any other record in the same congregation is geographically
// close enough to be a valid reference — recoverNearest only needs to be within ~55km) to
// recover the short codes too.
function decodePins(
  records: (RecordLocation & { color?: 'blue' | 'red' })[],
  // A congregation-wide reference point (see getCongregationPlusCodeAnchor) used only when this
  // specific record set has no full-form code of its own to anchor against — e.g. a search area
  // with a single freshly-added, manually-typed short code and nothing else nearby yet. Never
  // itself rendered as a pin, only used as a recovery reference.
  fallbackAnchor?: { lat: number; lng: number } | null
): Pin[] {
  const fullPins: Pin[] = []
  const shortRecords: (RecordLocation & { color?: 'blue' | 'red' })[] = []
  for (const r of records) {
    if (!openLocationCode.isValid(r.plusCode)) continue
    if (openLocationCode.isFull(r.plusCode)) {
      try {
        fullPins.push(toPin(r, r.plusCode))
      } catch {
        // Passed isValid/isFull but still failed to decode — skip rather than let one bad row
        // break the whole map.
      }
    } else {
      shortRecords.push(r)
    }
  }

  if (shortRecords.length === 0) return fullPins

  // No in-set anchor — fall back to the congregation-wide one if there is one. Still no safe
  // way to guess without ANY reference point (a wrong guess would silently place a pin in the
  // wrong city, worse than no pin at all), so this only ever recovers, never invents.
  const refLat = fullPins.length > 0 ? fullPins.reduce((sum, p) => sum + p.lat, 0) / fullPins.length : fallbackAnchor?.lat
  const refLng = fullPins.length > 0 ? fullPins.reduce((sum, p) => sum + p.lng, 0) / fullPins.length : fallbackAnchor?.lng
  if (refLat == null || refLng == null) return fullPins

  const recoveredPins: Pin[] = []
  for (const r of shortRecords) {
    try {
      const fullCode = openLocationCode.recoverNearest(r.plusCode, refLat, refLng)
      recoveredPins.push(toPin(r, fullCode))
    } catch {
      // Malformed short code that still passed isValid — skip.
    }
  }

  return [...fullPins, ...recoveredPins]
}

export default function HouseholdDistributionMap({
  records,
  fallbackAnchor,
}: {
  // color defaults to blue (existing behavior, every current call site) — an overflow
  // partnership's search-area map is the one place that passes 'red' for its own newly-added,
  // still-pending-approval records, to distinguish them from existing/pre-assigned ones.
  records: (RecordLocation & { color?: 'blue' | 'red' })[]
  // See decodePins — optional, only used to recover a short-form code when this record set has
  // no full-form code of its own.
  fallbackAnchor?: { lat: number; lng: number } | null
}) {
  const pins = useMemo(() => decodePins(records, fallbackAnchor), [records, fallbackAnchor])

  if (pins.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-slate-600">No approved records with a Plus Code yet.</p>
      </Card>
    )
  }

  // A fixed center+zoom used to leave the pins tiny and off-center for a tightly-clustered
  // territory (zoom 13 suits a whole town, not a block) — fitting bounds to the actual pins
  // instead means the view always lands zoomed to what's really there, however spread out.
  const bounds = L.latLngBounds(pins.map((p): [number, number] => [p.lat, p.lng]))

  return (
    // isolate: Leaflet's internal panes/markers/popups use their own z-index scale (200-700,
    // well above this app's fixed bottom nav at z-20). .leaflet-container is `position:
    // relative` with no z-index of its own, so without a stacking-context boundary here those
    // values escape straight into the page's global stacking order and paint over the nav bar
    // (confirmed live — pins rendering on top of Home/Partners/List/Record). `isolate` creates
    // that boundary so nothing inside this Card can ever render above page chrome outside it.
    <Card className="isolate overflow-hidden p-0">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [32, 32], maxZoom: 18 }}
        scrollWheelZoom
        style={{ width: '100%', aspectRatio: '1 / 1' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pin.color === 'red' ? redMarkerIcon : blueMarkerIcon}>
            <Popup>
              {/* Falls back through resident name, then Plus Code, before giving up — a record
                  with no address on file is still identifiable if it has either of those. */}
              <p className="font-medium">{pin.address || pin.residentName || pin.plusCode || 'No address on file'}</p>
              <p className="text-slate-500">{pin.territoryName}</p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </Card>
  )
}
