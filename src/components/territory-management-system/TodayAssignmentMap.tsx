'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { OpenLocationCode } from 'open-location-code'
import type { MapRecordPin } from '@/lib/territory-management-system/modules/assignment/queries'
import Card from '@/components/territory-management-system/dashboard/Card'
import 'leaflet/dist/leaflet.css'

const openLocationCode = new OpenLocationCode()

// One color per Ministry Partner, cycled if there are more partners than colors (a 12-color
// wheel comfortably covers a normal day's headcount before any repeat). Gray is reserved
// separately for "unassigned" — never part of this cycle, so a partner's own color can never be
// confused with the unassigned state.
const PARTNER_COLORS = [
  '#DC2626', '#EA580C', '#D97706', '#65A30D', '#16A34A', '#0D9488',
  '#0891B2', '#2563EB', '#4F46E5', '#7C3AED', '#C026D3', '#DB2777',
]
const UNASSIGNED_COLOR = '#9CA3AF'

function colorFor(index: number): string {
  return PARTNER_COLORS[index % PARTNER_COLORS.length]
}

// A plain colored circle rather than a per-color pin image — scales to any number of Ministry
// Partners without needing a matching set of raster/SVG pin assets (contrast
// HouseholdDistributionMap's fixed blue/red pins). Dimmed opacity + a dashed ring for the
// unassigned/gray case makes it read as "needs attention" at a glance, not just another color.
function dotIcon(color: string, unassigned: boolean): L.DivIcon {
  const style = unassigned
    ? `background:${color};opacity:0.55;border:2px dashed #ffffff;`
    : `background:${color};border:2px solid #ffffff;`
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:9999px;box-shadow:0 1px 3px rgba(0,0,0,0.4);${style}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
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
  const colorByPartnerId = useMemo(() => new Map(partners.map((p, i) => [p.id, colorFor(i)])), [partners])
  const partnerNameById = useMemo(() => new Map(partners.map((p) => [p.id, p.name])), [partners])

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
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorFor(i) }} />
            {p.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className="inline-block h-3 w-3 rounded-full border border-dashed border-white"
            style={{ background: UNASSIGNED_COLOR, opacity: 0.55 }}
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
            const partnerIndex = partners.findIndex((p) => p.id === pin.partnershipId)
            const color = pin.partnershipId ? colorByPartnerId.get(pin.partnershipId) ?? UNASSIGNED_COLOR : UNASSIGNED_COLOR
            return (
              <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={dotIcon(color, !pin.partnershipId)}>
                <Popup>
                  <p className="font-medium">{pin.address || pin.residentName || pin.plusCode || 'No address on file'}</p>
                  <p className="text-slate-500">{pin.territoryName}</p>
                  {pin.partnershipId ? (
                    <p className="mt-1 font-semibold" style={{ color }}>
                      {partnerNameById.get(pin.partnershipId) ?? `Partner ${partnerIndex + 1}`}
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
