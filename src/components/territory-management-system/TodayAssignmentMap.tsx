'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { OpenLocationCode } from 'open-location-code'
import type { MapRecordPin } from '@/lib/territory-management-system/modules/assignment/queries'
import { partnerColorFor, PARTNER_UNASSIGNED_COLOR } from '@/lib/territory-management-system/partnerColors'
import Card from '@/components/territory-management-system/dashboard/Card'
import PartnerColorBadge from '@/components/territory-management-system/PartnerColorBadge'
import 'leaflet/dist/leaflet.css'

const openLocationCode = new OpenLocationCode()

// A plain colored circle rather than a per-color pin image — scales to any number of Ministry
// Partners without needing a matching set of raster/SVG pin assets (contrast
// HouseholdDistributionMap's fixed blue/red pins). The partner's own sequence number sits
// centered on the fill (see PARTNER_COLORS' comment on why color alone isn't a safe enough
// signal here) — unassigned pins carry no number, just the dashed gray ring, since there's no
// partner to label them with.
function dotIcon(color: string, textColor: string, label: string | null, unassigned: boolean): L.DivIcon {
  const style = unassigned
    ? `background:${color};opacity:0.6;border:2px dashed #ffffff;`
    : `background:${color};border:2px solid #ffffff;`
  const numeral = label
    ? `<span style="color:${textColor};font:700 11px/24px system-ui,-apple-system,sans-serif;">${label}</span>`
    : ''
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:9999px;box-shadow:0 1px 3px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;${style}">${numeral}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

interface Pin extends MapRecordPin {
  lat: number
  lng: number
}

function toPin(r: MapRecordPin, code: string): Pin {
  const area = openLocationCode.decode(code)
  return { ...r, lat: area.latitudeCenter, lng: area.longitudeCenter }
}

// Same two-pass short/full Plus Code decoding as HouseholdDistributionMap.decodePins — see that
// component's comment for the full reasoning. Kept as a separate copy rather than a shared
// helper since the two pin shapes (color swatch vs. blue/red) have diverged enough that a shared
// generic added more indirection than it saved.
function decodePins(records: MapRecordPin[], fallbackAnchor?: { lat: number; lng: number } | null): Pin[] {
  const fullPins: Pin[] = []
  const shortRecords: MapRecordPin[] = []
  for (const r of records) {
    if (!openLocationCode.isValid(r.plusCode)) continue
    if (openLocationCode.isFull(r.plusCode)) {
      try {
        fullPins.push(toPin(r, r.plusCode))
      } catch {
        // Passed isValid/isFull but still failed to decode — skip rather than break the map.
      }
    } else {
      shortRecords.push(r)
    }
  }

  if (shortRecords.length === 0) return fullPins

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

interface PartnerInfo {
  id: string
  name: string
}

function AssignPopupBody({
  pin,
  partners,
  onAssign,
}: {
  pin: Pin
  partners: PartnerInfo[]
  onAssign: (recordId: string, partnershipId: string) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [selected, setSelected] = useState(partners[0]?.id ?? '')
  const [pending, startTransition] = useTransition()

  function handleAssign() {
    if (!selected) return
    startTransition(async () => {
      const result = await onAssign(pin.id, selected)
      if (result.error) toast.error(result.error)
      else {
        toast.success('Assigned.')
        router.refresh()
      }
    })
  }

  if (partners.length === 0) {
    return <p className="mt-1 text-slate-500">No Ministry Partners available to assign to yet.</p>
  }

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending}
        className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs"
      >
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleAssign}
        disabled={pending}
        className="shrink-0 rounded bg-[#2563EB] px-2 py-1 text-xs font-semibold text-white transition hover:bg-[#1d4fd1] disabled:opacity-50"
      >
        {pending ? 'Assigning…' : 'Assign'}
      </button>
    </div>
  )
}

export default function TodayAssignmentMap({
  records,
  partners,
  onAssignRecord,
  fallbackAnchor,
}: {
  records: MapRecordPin[]
  // Every Ministry Partner across today's batches (House To House + any Auxiliary Groups), in
  // display order — also determines each partner's color (index into PARTNER_COLORS).
  partners: PartnerInfo[]
  onAssignRecord: (recordId: string, partnershipId: string) => Promise<{ error?: string }>
  fallbackAnchor?: { lat: number; lng: number } | null
}) {
  const pins = useMemo(() => decodePins(records, fallbackAnchor), [records, fallbackAnchor])
  // Position in this array (1-based) — not the partnership's own `sequence` column — is what
  // labels each pin/legend swatch: `sequence` restarts at 1 per batch, so two different
  // batches' "Partner 1" would otherwise render the same number on the map.
  const infoByPartnerId = useMemo(
    () => new Map(partners.map((p, i) => [p.id, { ...partnerColorFor(i), label: String(i + 1), name: p.name }])),
    [partners]
  )

  if (pins.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-slate-600">No approved contact records with a Plus Code in today&apos;s assignment yet.</p>
      </Card>
    )
  }

  const bounds = L.latLngBounds(pins.map((p): [number, number] => [p.lat, p.lng]))
  const unassignedCount = pins.filter((p) => !p.partnershipId).length

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-x-4 gap-y-2 p-3">
        {partners.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1.5 text-xs text-slate-600">
            <PartnerColorBadge index={i} />
            {p.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className="inline-block h-4 w-4 rounded-full border border-dashed border-white"
            style={{ background: PARTNER_UNASSIGNED_COLOR, opacity: 0.6 }}
          />
          Unassigned{unassignedCount > 0 ? ` (${unassignedCount})` : ''}
        </span>
      </Card>

      {/* isolate: see HouseholdDistributionMap's own comment — keeps Leaflet's internal
          z-index scale from escaping this Card and painting over the fixed bottom nav. */}
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
          {pins.map((pin) => {
            const info = pin.partnershipId ? infoByPartnerId.get(pin.partnershipId) : undefined
            const icon = info
              ? dotIcon(info.fill, info.text, info.label, false)
              : dotIcon(PARTNER_UNASSIGNED_COLOR, '#0b0b0b', null, true)
            return (
              <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={icon}>
                <Popup>
                  <p className="font-medium">{pin.address || pin.residentName || pin.plusCode || 'No address on file'}</p>
                  <p className="text-slate-500">{pin.territoryName}</p>
                  {info ? (
                    <p className="mt-1 font-semibold" style={{ color: info.fill }}>
                      #{info.label} — {info.name}
                    </p>
                  ) : (
                    <AssignPopupBody pin={pin} partners={partners} onAssign={onAssignRecord} />
                  )}
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </Card>
    </div>
  )
}
