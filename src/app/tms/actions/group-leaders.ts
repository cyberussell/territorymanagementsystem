'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { inviteGroupLeaderSchema } from '@/lib/territory-management-system/modules/groupLeaders/schema'
import {
  deleteGroupLeader,
  getGroupLeader,
  inviteGroupLeader,
  resetGroupLeaderPassword,
  restoreGroupLeaderAccess,
  revokeGroupLeaderAccess,
} from '@/lib/territory-management-system/modules/groupLeaders/queries'
import { type ActionResult } from './shared'

const GROUP_LEADERS_PATH = '/tms/dashboard/group-leaders'

// tempPassword rides alongside the usual error/'SAVED' sentinel shape — useServerAction is
// generic now specifically to support this, since the Admin needs to actually see the
// generated password once, not just a toast confirming success.
export interface InviteGroupLeaderResult extends ActionResult {
  tempPassword?: string
}

export async function inviteGroupLeaderAction(_prev: InviteGroupLeaderResult, formData: FormData): Promise<InviteGroupLeaderResult> {
  const { congregation } = await requireAdmin()
  const parsed = inviteGroupLeaderSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    tempPassword: formData.get('tempPassword'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in first name, last name, and a valid email.' }

  const admin = createAdminSupabase()
  const result = await inviteGroupLeader(admin, congregation.id, parsed.data)
  if (result.error) return { error: result.error }

  revalidatePath(GROUP_LEADERS_PATH)
  return { error: 'SAVED', tempPassword: result.tempPassword }
}

export async function resetGroupLeaderPasswordAction(profileId: string, customPassword?: string): Promise<{ error?: string; tempPassword?: string }> {
  const { congregation } = await requireAdmin()
  // Re-validated server-side even though GroupLeadersManager's window.prompt already checks
  // this client-side — never trust a client-supplied value alone.
  if (customPassword && customPassword.length < 8) return { error: 'Temporary password must be at least 8 characters.' }
  const admin = createAdminSupabase()
  const groupLeader = await getGroupLeader(admin, congregation.id, profileId)
  if (!groupLeader) return { error: 'Group Leader not found.' }

  const result = await resetGroupLeaderPassword(admin, profileId, customPassword || undefined)
  if (result.error) return { error: result.error }
  return { tempPassword: result.tempPassword }
}

export async function revokeGroupLeaderAccessAction(profileId: string): Promise<{ error?: string }> {
  const { congregation } = await requireAdmin()
  const admin = createAdminSupabase()
  const groupLeader = await getGroupLeader(admin, congregation.id, profileId)
  if (!groupLeader) return { error: 'Group Leader not found.' }

  const result = await revokeGroupLeaderAccess(admin, profileId)
  if (result.error) return result
  revalidatePath(GROUP_LEADERS_PATH)
  return {}
}

export async function restoreGroupLeaderAccessAction(profileId: string): Promise<{ error?: string }> {
  const { congregation } = await requireAdmin()
  const admin = createAdminSupabase()
  const groupLeader = await getGroupLeader(admin, congregation.id, profileId)
  if (!groupLeader) return { error: 'Group Leader not found.' }

  const result = await restoreGroupLeaderAccess(admin, profileId)
  if (result.error) return result
  revalidatePath(GROUP_LEADERS_PATH)
  return {}
}

export async function deleteGroupLeaderAction(profileId: string): Promise<{ error?: string }> {
  const { congregation } = await requireAdmin()
  const admin = createAdminSupabase()
  const groupLeader = await getGroupLeader(admin, congregation.id, profileId)
  if (!groupLeader) return { error: 'Group Leader not found.' }

  const result = await deleteGroupLeader(admin, profileId)
  if (result.error) return result
  revalidatePath(GROUP_LEADERS_PATH)
  return {}
}
