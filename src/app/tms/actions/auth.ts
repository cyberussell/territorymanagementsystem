'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createAdminSupabase, createServerSupabase } from '@/lib/territory-management-system/supabase-server'
import { checkRateLimit, clientIp } from '@/lib/territory-management-system/rateLimit'
import type { UserRole } from '@/lib/territory-management-system/modules/auth/types'
import { type ActionResult } from './shared'

// No signup action this pass — congregations + their first admin/group leader are provisioned
// manually (see territory-management-system/SETUP.md §3).

const ROLE_REDIRECT: Record<UserRole, string> = {
  admin: '/tms/dashboard',
  group_leader: '/tms/group-leader/dashboard',
}

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers())

  // Honeypot (see LoginForm.tsx's hidden "website" field) — a real browser never fills this
  // in, but a basic bot that blindly fills every input on the form usually does. Short-circuits
  // before ever touching Supabase auth (cheaper per attempt, and skips the profile lookup
  // entirely) and applies a much stricter per-IP limit than the real login counter below, so a
  // repeat offender gets blocked fast. The error message is identical to a real failed login —
  // a bot can't tell "caught by the honeypot" from "wrong password" and adjust.
  if (String(formData.get('website') ?? '').trim() !== '') {
    await checkRateLimit(`tms-login-honeypot:${ip}`, 1)
    return { error: 'Invalid email or password.' }
  }

  if (!(await checkRateLimit(`tms-login:${ip}`, 10))) {
    return { error: 'Too many login attempts. Please wait a minute and try again.' }
  }

  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'Invalid email or password.' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, must_change_password')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profileError || !profile) return { error: 'Could not load your account. Please try again.' }

  // Set on invite and on an Admin-triggered password reset (temp-password flow, replacing the
  // emailed invite/reset links this session — see docs/checkpoints/territory-management-invite-flow-map-recovery-field-rename-v1.md).
  // Blocks reaching the dashboard until a real password is chosen.
  if (profile.must_change_password) redirect('/tms/change-password')

  const role = profile.role as UserRole
  redirect(ROLE_REDIRECT[role])
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/tms/login')
}

// Reached only from /change-password, which every login funnels through first when
// must_change_password is set (invite or Admin-triggered reset). Deliberately doesn't go
// through requireAdmin()/requireGroupLeader() — those would redirect back here in a loop while
// the flag is still set.
export async function changePasswordAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirm) return { error: 'Passwords do not match.' }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired — please log in again.' }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) return { error: updateError.message }

  // profiles writes are revoked from the authenticated Postgres role entirely (015 migration,
  // closing a privilege-escalation gap) — even clearing your own flag needs the service-role
  // client, same as every other profile mutation in this product.
  const admin = createAdminSupabase()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)
    .select('role')
    .maybeSingle()
  if (profileError) return { error: 'Password updated, but could not finish setup — please contact your administrator.' }

  const role = profile?.role as UserRole | undefined
  redirect(role ? ROLE_REDIRECT[role] : '/tms/login')
}
