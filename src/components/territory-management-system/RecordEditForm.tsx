'use client'

import { updateRecordAction } from '@/app/tms/actions/records'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export default function RecordEditForm({ record }: { record: TerritoryRecordWithLocation }) {
  const { dispatch, pending, error } = useServerAction(updateRecordAction, ['SAVED'], 'Record updated.')

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold text-[#0B1B33]">Edit Contact Record</h2>
      <form action={dispatch} className="space-y-4">
        <input type="hidden" name="recordId" value={record.id} />
        <FormField label="Address" optional>
          <input name="address" maxLength={200} defaultValue={record.address} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Unit" optional>
            <input name="unit" maxLength={40} defaultValue={record.unit} className={inputClass} />
          </FormField>
          <FormField label="Resident name" optional>
            <input name="residentName" maxLength={120} defaultValue={record.resident_name} className={inputClass} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Plus Code" optional>
            <input name="plusCode" maxLength={20} defaultValue={record.plus_code ?? ''} placeholder="e.g. 7FG8+4V" className={inputClass} />
          </FormField>
          <FormField label="Household members" optional>
            <input
              name="householdMembers"
              type="number"
              min={0}
              max={99}
              defaultValue={record.household_members ?? ''}
              className={inputClass}
            />
          </FormField>
        </div>
        <FormField label="Notes" optional>
          <textarea name="notes" maxLength={500} rows={2} defaultValue={record.notes} className={inputClass} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="doNotCall" value="true" defaultChecked={record.do_not_call} className="h-4 w-4 rounded border-blue-200" />
          Do Not Call
        </label>
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
