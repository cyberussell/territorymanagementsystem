import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Congregation } from './types'

export async function updateCongregation(
  supabase: SupabaseClient,
  congregationId: string,
  updates: { name: string; congregation_number: string; timezone: string }
): Promise<Congregation> {
  const { data, error } = await supabase
    .from('congregations')
    .update(updates)
    .eq('id', congregationId)
    .select('*')
    .single()
  if (error) throw error
  return data as Congregation
}
