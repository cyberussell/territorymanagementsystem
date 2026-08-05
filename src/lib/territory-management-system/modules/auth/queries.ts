import 'server-only'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '../../supabase-server'
import type { Congregation } from '../congregation/types'
import type { UserRole } from './types'

export interface RoleSession {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>
  userId: string
  // Plain-text snapshot of the signed-in user's profiles.full_name — used to attribute
  // change-history entries (records/queries.ts's logRecordHistory) without a separate lookup.
  userName: string
  congregation: Congregation
}

async function requireRole(role: UserRole): Promise<RoleSession> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/tms/login')

  // Profile + congregation in one round-trip via the existing profiles.congregation_id FK
  // (PostgREST resolves the embed server-side) — this ran as two sequential fetches before,
  // adding a full extra Supabase round-trip to every single authenticated TMS page load.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, congregation_id, revoked_at, must_change_password, full_name, congregation:congregations(*)')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.role !== role) redirect('/tms/login')
  // Defense in depth: the account itself is also banned server-side the moment access is
  // revoked (see revokeGroupLeaderAccess), but a session token issued just before that could
  // otherwise still pass auth.getUser() until it naturally expires.
  if (profile.revoked_at) redirect('/tms/login?error=revoked')
  // Enforced here (not just at the login redirect) so a session that already existed when an
  // Admin reset this account's password — or a tab left open from before — can't reach any
  // dashboard page without first setting a real password.
  if (profile.must_change_password) redirect('/tms/change-password')
  if (!profile.congregation_id || !profile.congregation) redirect('/tms/login?error=not_provisioned')

  return { supabase, userId: user.id, userName: profile.full_name || 'Admin', congregation: profile.congregation as unknown as Congregation }
}

// Admin dashboard pages/actions call this: resolves the signed-in admin + their congregation.
// Redirects to login if unauthenticated, wrong role, or if provisioning is incomplete (no
// congregation linked yet — see territory-management-system/SETUP.md §3).
export async function requireAdmin(): Promise<RoleSession> {
  return requireRole('admin')
}

// Group Leader dashboard pages call this — same shape as requireAdmin, gated on the
// 'group_leader' role instead. Read-only surface, enforced at the RLS layer (003 migration),
// not just here.
export async function requireGroupLeader(): Promise<RoleSession> {
  return requireRole('group_leader')
}
