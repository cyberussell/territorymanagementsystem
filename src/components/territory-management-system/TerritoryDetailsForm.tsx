'use client'

import { updateTerritoryDetails } from '@/app/tms/actions/territories'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import type { Territory } from '@/lib/territory-management-system/modules/territory/types'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export default function TerritoryDetailsForm({ territory }: { territory: Territory }) {
  const { dispatch, pending, error } = useServerAction(updateTerritoryDetails, ['SAVED'], 'Territory updated.')

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold text-[#0B1B33]">Territory details</h2>
      <form action={dispatch} className="space-y-4">
        <input type="hidden" name="territoryId" value={territory.id} />
        <FormField label="Territory Number">
          <input name="name" required maxLength={120} defaultValue={territory.name} className={inputClass} />
        </FormField>
        <FormField label="Barangay Name">
          <textarea name="description" required maxLength={500} rows={3} defaultValue={territory.description} className={inputClass} />
        </FormField>
        <FormField label="Status">
          <select name="status" defaultValue={territory.status} className={inputClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </FormField>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </Card>
  )
}
