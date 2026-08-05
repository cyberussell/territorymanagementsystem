import { createBrowserClient } from '@supabase/ssr'

// The Territory Management System runs on its OWN Supabase project, separate from the main
// site's, the Appointment System's, and the Laundry Management System's, so it can be
// deployed as a standalone product.
export function getTmsEnv() {
  const url = process.env.NEXT_PUBLIC_TMS_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_TMS_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'TMS Supabase env vars missing. Set NEXT_PUBLIC_TMS_SUPABASE_URL and NEXT_PUBLIC_TMS_SUPABASE_ANON_KEY (see territory-management-system/SETUP.md).'
    )
  }
  return { url, anonKey }
}

export function createBrowserSupabase() {
  const { url, anonKey } = getTmsEnv()
  return createBrowserClient(url, anonKey)
}
