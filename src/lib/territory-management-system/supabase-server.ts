import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getTmsEnv } from './supabase'

// Session-scoped client for server components / actions. RLS applies.
export async function createServerSupabase() {
  const { url, anonKey } = getTmsEnv()
  const cookieStore = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component where cookies are read-only; the
          // session is refreshed by route handlers / server actions instead.
        }
      },
    },
  })
}

// Service-role client for trusted server-side operations (congregation/admin provisioning).
// Bypasses RLS — never expose to the browser.
let adminClient: SupabaseClient | null = null
export function createAdminSupabase(): SupabaseClient {
  if (adminClient) return adminClient
  const { url } = getTmsEnv()
  const serviceKey = process.env.TMS_SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error('TMS_SUPABASE_SERVICE_ROLE_KEY is missing (see territory-management-system/SETUP.md).')
  }
  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}
