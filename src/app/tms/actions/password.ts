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
  // full reasoning). This does surface that the address belongs to a Group Leader account
  // specifically (a narrower leak than the generic "SAVED" response), but a group leader who
  // owns the address needs to know no email is coming instead of waiting on one that never
  // arrives — the previous "SAVED" here was actively misleading them, not just non-disclosing.
  const admin = createAdminSupabase()
  const { data: profile } = await admin.from('profiles').select('role').eq('email', parsed.data.email).maybeSingle()
  if (profile?.role === 'group_leader') {
    return { error: 'Group Leaders don’t use email reset — ask your Administrator to reset your password from the Group Leaders page.' }
  }

  const supabase = await createServerSupabase()
  // Always the same success message regardless of whether the email actually has an account —
  // avoids leaking which addresses are registered.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: 'https://www.cyberussell.com/tms/set-password',
  })
  return { error: 'SAVED' }
}
