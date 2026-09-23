import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateCongregationInput } from './schema'

// Where the invite email's link lands. The invite email template (email-templates/
// invite-user.html) builds its own link straight to this page with a token_hash, which
// set-password verifies with verifyOtp — that works on any device, unlike the old
// {{ .ConfirmationURL }} invite links (see groupLeaders/queries.ts's inviteGroupLeader comment).
// redirectTo is still passed so a dashboard still on Supabase's default template lands here too.
const SET_PASSWORD_URL = 'https://www.cyberussell.com/tms/set-password'

export interface CongregationAdminSummary {
  id: string
  fullName: string
  email: string | null
  // False until the invited Administrator opens their link and sets a password.
  hasSignedIn: boolean
}

export interface PlatformCongregation {
  id: string
  name: string
  congregationNumber: string
  timezone: string
  createdAt: string
  admins: CongregationAdminSummary[]
  groupLeaderCount: number
  territoryCount: number
  recordCount: number
}

// Every call here takes the service-role client — callers must run requireSuperAdmin() first.
export async function listPlatformCongregations(service: SupabaseClient): Promise<PlatformCongregation[]> {
  const [{ data: congregations }, { data: profiles }, { data: territories }, { data: usersPage }] = await Promise.all([
    service.from('congregations').select('id, name, congregation_number, timezone, created_at').order('created_at', { ascending: false }),
    service.from('profiles').select('id, role, congregation_id, full_name, email').in('role', ['admin', 'group_leader']),
    service.from('territories').select('congregation_id'),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])
  const lastSignInById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]))

  const rows = (congregations ?? []) as { id: string; name: string; congregation_number: string; timezone: string; created_at: string }[]
  // Head-only counts, one per congregation, run concurrently — records is the one table here
  // that grows without bound, so it's counted server-side instead of fetched.
  const recordCounts = await Promise.all(
    rows.map(async (c) => {
      const { count } = await service.from('territory_records').select('id', { count: 'exact', head: true }).eq('congregation_id', c.id)
      return count ?? 0
    })
  )

  const profileRows = (profiles ?? []) as { id: string; role: string; congregation_id: string | null; full_name: string; email: string | null }[]
  const territoryRows = (territories ?? []) as { congregation_id: string }[]

  return rows.map((c, i) => ({
    id: c.id,
    name: c.name,
    congregationNumber: c.congregation_number,
    timezone: c.timezone,
    createdAt: c.created_at,
    admins: profileRows
      .filter((p) => p.congregation_id === c.id && p.role === 'admin')
      .map((p) => ({ id: p.id, fullName: p.full_name, email: p.email, hasSignedIn: Boolean(lastSignInById.get(p.id)) })),
    groupLeaderCount: profileRows.filter((p) => p.congregation_id === c.id && p.role === 'group_leader').length,
    territoryCount: territoryRows.filter((t) => t.congregation_id === c.id).length,
    recordCount: recordCounts[i],
  }))
}

function friendlyInviteError(message: string): string {
  if (/already been registered|already exists/i.test(message)) return 'That email already has an account in this system.'
  if (/rate limit/i.test(message)) return 'Too many invite emails were sent recently. Wait a while and try again.'
  return message
}

// Creates the congregation, then emails its first Administrator an invite. Supabase has no
// cross-service transaction, so each later step undoes the earlier ones if it fails — a failed
// invite never leaves behind a congregation with nobody able to sign in to it.
export async function createCongregationWithAdminInvite(service: SupabaseClient, input: CreateCongregationInput): Promise<{ error?: string }> {
  const { data: congregation, error: congregationError } = await service
    .from('congregations')
    .insert({ name: input.name, congregation_number: input.congregationNumber, timezone: input.timezone })
    .select('id')
    .single()
  if (congregationError) {
    if (congregationError.code === '23505') return { error: `Congregation number ${input.congregationNumber} is already registered.` }
    return { error: congregationError.message }
  }
  const congregationId = congregation.id as string

  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(input.adminEmail, {
    data: { full_name: input.adminName, congregation_name: input.name },
    redirectTo: SET_PASSWORD_URL,
  })
  if (inviteError || !invited.user) {
    await service.from('congregations').delete().eq('id', congregationId)
    return { error: friendlyInviteError(inviteError?.message ?? 'Could not send the invite.') }
  }

  // Upsert, not update — same race with handle_new_user() that inviteGroupLeader documents.
  const { error: profileError } = await service.from('profiles').upsert({
    id: invited.user.id,
    role: 'admin',
    congregation_id: congregationId,
    email: input.adminEmail,
    full_name: input.adminName,
    must_change_password: false,
  })
  if (profileError) {
    await service.auth.admin.deleteUser(invited.user.id)
    await service.from('congregations').delete().eq('id', congregationId)
    return { error: profileError.message }
  }
  return {}
}

// Re-sends the invite email to an Administrator who hasn't signed in yet. Supabase re-sends
// for a user who hasn't accepted their invite, and refuses for one who already has.
export async function resendAdminInvite(service: SupabaseClient, profileId: string): Promise<{ error?: string }> {
  const { data: profile } = await service
    .from('profiles')
    .select('email, full_name, role, congregation:congregations(name)')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile || profile.role !== 'admin' || !profile.email) return { error: 'Administrator not found.' }

  const congregationName = (profile.congregation as unknown as { name: string } | null)?.name ?? ''
  const { error } = await service.auth.admin.inviteUserByEmail(profile.email as string, {
    data: { full_name: profile.full_name, congregation_name: congregationName },
    redirectTo: SET_PASSWORD_URL,
  })
  if (error) return { error: friendlyInviteError(error.message) }
  return {}
}
