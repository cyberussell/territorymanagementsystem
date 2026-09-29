'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import {
  createCongregationSchema,
  deleteCongregationSchema,
  updateCongregationSchema,
} from '@/lib/territory-management-system/modules/platform/schema'
import {
  createCongregationWithAdminInvite,
  deleteCongregationPermanently,
  resendAdminInvite,
  updateCongregationDetails,
} from '@/lib/territory-management-system/modules/platform/queries'
import { type ActionResult } from './shared'

const PLATFORM_PATH = '/tms/platform'

export async function createCongregationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin()
  const parsed = createCongregationSchema.safeParse({
    name: formData.get('name'),
    congregationNumber: formData.get('congregationNumber'),
    timezone: formData.get('timezone'),
    adminName: formData.get('adminName') ?? '',
    adminEmail: formData.get('adminEmail'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the form correctly.' }

  const result = await createCongregationWithAdminInvite(createAdminSupabase(), parsed.data)
  if (result.error) return { error: result.error }
  revalidatePath(PLATFORM_PATH)
  return { error: 'SAVED' }
}

export async function updateCongregationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin()
  const parsed = updateCongregationSchema.safeParse({
    congregationId: formData.get('congregationId'),
    name: formData.get('name'),
    congregationNumber: formData.get('congregationNumber'),
    timezone: formData.get('timezone'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in the form correctly.' }

  const result = await updateCongregationDetails(createAdminSupabase(), parsed.data)
  if (result.error) return { error: result.error }
  revalidatePath(PLATFORM_PATH)
  return { error: 'SAVED' }
}

export async function deleteCongregationAction(congregationId: string, confirmNumber: string): Promise<{ error?: string }> {
  await requireSuperAdmin()
  const parsed = deleteCongregationSchema.safeParse({ congregationId, confirmNumber })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Could not delete the congregation.' }

  const result = await deleteCongregationPermanently(createAdminSupabase(), parsed.data)
  revalidatePath(PLATFORM_PATH)
  return result
}

export async function resendAdminInviteAction(profileId: string): Promise<{ error?: string }> {
  await requireSuperAdmin()
  const result = await resendAdminInvite(createAdminSupabase(), profileId)
  revalidatePath(PLATFORM_PATH)
  return result
}
