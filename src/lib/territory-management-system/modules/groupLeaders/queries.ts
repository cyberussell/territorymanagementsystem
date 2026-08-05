import 'server-only'
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// No 0/O/1/l/I — a temp password an Admin has to read aloud or retype to relay to a Group
// Leader shouldn't hinge on distinguishing those by font.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function generateTempPassword(length = 12): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length]
  return out
}

// Every function here operates on the service-role client — profiles RLS only ever allowed
// reading your own row (no admin ever needed to list other congregation members before), so
// there's no policy to lean on for "list every Group Leader in my congregation." Congregation
// scoping is therefore enforced explicitly in every query/mutation below, not by RLS.

export interface GroupLeaderProfile {
  id: string
  full_name: string
  email: string | null
  revoked_at: string | null
  created_at: string
}

export async function listGroupLeaders(supabase: SupabaseClient, congregationId: string): Promise<GroupLeaderProfile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, revoked_at, created_at')
    .eq('congregation_id', congregationId)
    .eq('role', 'group_leader')
    .order('created_at', { ascending: false })
  return (data ?? []) as GroupLeaderProfile[]
}

// Re-resolved server-side before every mutation below — never trusts a client-supplied id alone
// without also confirming it belongs to the calling admin's own congregation.
export async function getGroupLeader(supabase: SupabaseClient, congregationId: string, profileId: string): Promise<GroupLeaderProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, revoked_at, created_at')
    .eq('id', profileId)
    .eq('congregation_id', congregationId)
    .eq('role', 'group_leader')
    .maybeSingle()
  return (data as GroupLeaderProfile | null) ?? null
}

// Creates the account with a generated temporary password instead of an emailed invite link —
// confirmed with Russell, replacing the previous inviteUserByEmail() flow entirely. That flow's
// links were always implicit-flow (Supabase's own SDK docs: PKCE is unsupported for
// inviteUserByEmail), which @supabase/ssr's browser client can't process since it hardcodes
// PKCE with no override — see docs/checkpoints/territory-management-invite-flow-map-recovery-field-rename-v1.md
// for the full root-cause writeup. A temp password sidesteps the whole email-link fragility
// class: no link to expire, no cross-device/cross-browser PKCE mismatch, nothing to deliver by
// email at all. The Admin sees the password once (returned here) and relays it directly; the
// account is flagged must_change_password so the Group Leader is forced onto a
// change-password screen before reaching their dashboard on first login.
export async function inviteGroupLeader(
  supabase: SupabaseClient,
  congregationId: string,
  input: { firstName: string; lastName: string; email: string; tempPassword?: string }
): Promise<{ error?: string; tempPassword?: string }> {
  const fullName = `${input.firstName} ${input.lastName}`.trim()
  const tempPassword = input.tempPassword || generateTempPassword()
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) return { error: error.message }
  if (!data.user) return { error: 'Could not create the account.' }

  // handle_new_user() (001_init.sql) creates the profile row with role='admin' (the column
  // default) and no congregation as part of the same trigger-driven insert — this is what turns
  // it into an actual Group Leader attached to the inviting admin's own congregation. Upsert
  // rather than update: an .update().eq('id', ...) that happens to race the trigger (or matches
  // zero rows for any other reason) succeeds with no error and silently does nothing, leaving
  // the invited user able to log in but stuck with no congregation — exactly the failure this
  // was hitting live. Upsert writes the row unconditionally, so it can't go missing regardless
  // of whether the trigger's insert has already landed.
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id,
    role: 'group_leader',
    congregation_id: congregationId,
    email: input.email,
    full_name: fullName,
    must_change_password: true,
  })
  if (profileError) return { error: profileError.message }
  return { tempPassword }
}

// Admin-triggered reset — same temp-password mechanism as inviteGroupLeader, for a Group
// Leader who's forgotten their password or needs a fresh one for any other reason. Replaces
// self-service resetPasswordForEmail() for Group Leader accounts (confirmed with Russell),
// unifying both onboarding and recovery under the same link-free flow.
export async function resetGroupLeaderPassword(
  supabase: SupabaseClient,
  profileId: string,
  customPassword?: string
): Promise<{ error?: string; tempPassword?: string }> {
  const tempPassword = customPassword || generateTempPassword()
  const { error: passwordError } = await supabase.auth.admin.updateUserById(profileId, { password: tempPassword })
  if (passwordError) return { error: passwordError.message }
  const { error: profileError } = await supabase.from('profiles').update({ must_change_password: true }).eq('id', profileId)
  if (profileError) return { error: profileError.message }
  return { tempPassword }
}

// Immediate and always available — bans the login but leaves the profile row in place as
// history. ban_duration has no literal "forever"; ~100 years is the conventional stand-in.
const PERMANENT_BAN_DURATION = '876000h'

export async function revokeGroupLeaderAccess(supabase: SupabaseClient, profileId: string): Promise<{ error?: string }> {
  const { error: banError } = await supabase.auth.admin.updateUserById(profileId, { ban_duration: PERMANENT_BAN_DURATION })
  if (banError) return { error: banError.message }
  const { error } = await supabase.from('profiles').update({ revoked_at: new Date().toISOString() }).eq('id', profileId)
  if (error) return { error: error.message }
  return {}
}

export async function restoreGroupLeaderAccess(supabase: SupabaseClient, profileId: string): Promise<{ error?: string }> {
  const { error: banError } = await supabase.auth.admin.updateUserById(profileId, { ban_duration: 'none' })
  if (banError) return { error: banError.message }
  const { error } = await supabase.from('profiles').update({ revoked_at: null }).eq('id', profileId)
  if (error) return { error: error.message }
  return {}
}

// Permanently removes a history entry (cascades to the profile row via auth.users' FK) — no
// minimum-age gate (removed per Russell's request; the caller still re-verifies the row belongs
// to the calling admin's own congregation before this is reached, just no longer checks age).
export async function deleteGroupLeader(supabase: SupabaseClient, profileId: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.admin.deleteUser(profileId)
  if (error) return { error: error.message }
  return {}
}
