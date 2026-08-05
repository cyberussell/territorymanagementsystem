'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { updateCongregationSchema } from '@/lib/territory-management-system/modules/congregation/schema'
import { updateCongregation } from '@/lib/territory-management-system/modules/congregation/queries'
import { type ActionResult } from './shared'

export async function updateCongregationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = updateCongregationSchema.safeParse({
    name: formData.get('name'),
    congregationNumber: formData.get('congregationNumber'),
    timezone: formData.get('timezone'),
  })
  if (!parsed.success) return { error: 'Please fill in all fields correctly.' }

  const { supabase, congregation } = await requireAdmin()
  try {
    await updateCongregation(supabase, congregation.id, {
      name: parsed.data.name,
      congregation_number: parsed.data.congregationNumber,
      timezone: parsed.data.timezone,
    })
  } catch (e) {
    // Postgres unique_violation on congregations.congregation_number — translate the raw
    // constraint error into something an admin can actually act on.
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      return { error: 'That congregation number is already in use.' }
    }
    return { error: e instanceof Error ? e.message : 'Could not update congregation settings.' }
  }

  revalidatePath('/tms/dashboard/settings')
  return { error: 'SAVED' }
}
