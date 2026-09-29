'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PlatformCongregation } from '@/lib/territory-management-system/modules/platform/queries'
import { updateCongregationAction } from '@/app/tms/actions/platform'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'

export default function EditCongregationModal({ congregation, onClose }: { congregation: PlatformCongregation; onClose: () => void }) {
  const router = useRouter()
  const { dispatch, pending, error, successMessage } = useServerAction(updateCongregationAction, ['SAVED'], 'Congregation updated.')
  const [timezone, setTimezone] = useState(congregation.timezone)

  useEffect(() => {
    if (!successMessage) return
    router.refresh()
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successMessage])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-gray-300 bg-white p-6 shadow-xl">
        <h2 className="font-semibold text-[#0B1B33]">Edit Congregation</h2>
        <form action={dispatch} className="mt-4 space-y-4">
          <input type="hidden" name="congregationId" value={congregation.id} />
          <FormField label="Congregation name">
            <input name="name" required maxLength={120} defaultValue={congregation.name} className={inputClass} />
          </FormField>
          <FormField label="Congregation number">
            <input
              name="congregationNumber"
              required
              maxLength={20}
              inputMode="numeric"
              defaultValue={congregation.congregationNumber}
              className={inputClass}
            />
          </FormField>
          <FormField label="Time zone">
            <input name="timezone" required value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass} />
          </FormField>
          {/* Assignment links are day-scoped to this time zone, so changing it moves when today's
              links end for every Group Leader and publisher in the congregation. */}
          {timezone.trim() !== congregation.timezone && (
            <p className="text-xs text-amber-700">
              Changing the time zone changes when today&apos;s assignment links end for this congregation.
            </p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
