'use client'

import { updateCongregationAction } from '@/app/tms/actions/congregation'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import type { Congregation } from '@/lib/territory-management-system/modules/congregation/types'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export default function CongregationSettingsForm({ congregation }: { congregation: Congregation }) {
  const { dispatch, pending, error } = useServerAction(updateCongregationAction, ['SAVED'], 'Settings saved.')

  return (
    <Card className="max-w-xl p-6">
      <form action={dispatch} className="space-y-4">
        <FormField label="Congregation name">
          <input name="name" required maxLength={120} defaultValue={congregation.name} className={inputClass} />
        </FormField>
        <FormField label="Congregation number">
          <input
            name="congregationNumber"
            required
            maxLength={20}
            defaultValue={congregation.congregation_number}
            className={inputClass}
          />
        </FormField>
        <FormField label="Timezone">
          <input
            name="timezone"
            required
            maxLength={60}
            defaultValue={congregation.timezone}
            placeholder="e.g. Asia/Manila"
            className={inputClass}
          />
        </FormField>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </Card>
  )
}
