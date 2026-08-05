'use client'

import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { uploadTerritoryMapAction } from '@/app/tms/actions/territories'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import Card from '@/components/territory-management-system/dashboard/Card'
import TerritoryMapViewer from '@/components/territory-management-system/TerritoryMapViewer'

export default function TerritoryMapUpload({
  territoryId,
  territoryName,
  mapImageUrl,
}: {
  territoryId: string
  territoryName: string
  mapImageUrl: string | null
}) {
  const { dispatch, pending, error } = useServerAction(uploadTerritoryMapAction, ['SAVED'], 'Map uploaded.')
  const [preview, setPreview] = useState<string | null>(null)

  // Revoke the previous preview's object URL whenever it's replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold text-[#0B1B33]">Territory map</h2>
      <form action={dispatch} className="space-y-3">
        <input type="hidden" name="territoryId" value={territoryId} />
        {preview ? (
          <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-blue-100 bg-[#F8FBFF]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected map" className="h-full w-full object-contain" />
          </div>
        ) : mapImageUrl ? (
          <div className="h-40 overflow-hidden rounded-xl border border-blue-100 bg-[#F8FBFF]">
            <TerritoryMapViewer mapImageUrl={mapImageUrl} territoryName={territoryName} />
          </div>
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-xl border border-blue-100 bg-[#F8FBFF]">
            <ImageIcon className="h-8 w-8 text-slate-300" />
          </div>
        )}
        <label className="block">
          <span className="text-sm font-medium text-slate-600">Upload a JPG or PNG map image</span>
          <input
            type="file"
            name="map"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#F0F6FF] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#2563EB]"
          />
          <span className="mt-1 block text-xs text-slate-600">JPG or PNG — up to 5MB.</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </Card>
  )
}
