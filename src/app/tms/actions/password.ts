'use server'

import { headers } from 'next/headers'
import { createAdminSupabase, createServerSupabase } from '@/lib/territory-management-system/supabase-server'
import { requestPasswordResetSchema } from '@/lib/territory-management-system/modules/groupLeaders/schema'
import { checkRateLimit, clientIp } from '@/lib/territory-management-system/rateLimit'
import { type ActionResult } from './shared'

export async function requestPasswordResetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = requestPasswordResetSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: 'Enter a valid email address.' }

  const ip = clientIp(await headers())
  if (!(await checkRateLimit(`tms-reset:${ip}`, 5))) {
    // Same generic message as success — don't let rate limiting itself leak account existence.
    return { error: 'SAVED' }
  }

  // Group Leader accounts no longer use emailed reset links at all (confirmed with Russell,
  // unifying with the invite flow's move to Admin-issued temp passwords — see
  // GroupLeadersManager.tsx's "Reset Password" button and the invite-flow checkpoint for the
  // full reasoning). Checking the role here and skipping the email send for a group_leader
  // account doesn't change the response shown to the requester either way (still the same
  // generic "SAVED" success), so it doesn't leak whether an email is registered — only whether
  // an actual email got sent, which isn't observable from the outside.
  const admin = createAdminSupabase()
  const { data: profile } = await admin.from('profiles').select('role').eq('email', parsed.data.email).maybeSingle()
  if (profile?.role === 'group_leader') return { error: 'SAVED' }

  const supabase = await createServerSupabase()
  // Always the same success message regardless of whether the email actually has an account —
  // avoids leaking which addresses are registered.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: 'https://www.cyberussell.com/tms/set-password',
  })
  return { error: 'SAVED' }
}
