import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DashboardStats {
  territoryCount: number
  sectionCount: number
  blockCount: number
  // Every territory_records row, including every additional person recorded at a Plus Code
  // already shared with another record — a plain row count, not deduplicated by address.
  recordCount: number
  pendingRecordCount: number
  visitsLoggedCount: number
  // Sum of household_members across every record — total people recorded, not addresses.
  householdMembersTotal: number
  // Distinct non-empty Plus Codes across all records — unique physical addresses/houses,
  // regardless of how many individual contact records (people) are logged at each one.
  totalHouses: number
}

export async function getDashboardStats(supabase: SupabaseClient, congregationId: string): Promise<DashboardStats> {
  const [territories, sections, blocks, records, pendingRecords, visits, recordAggregateFields] = await Promise.all([
    supabase.from('territories').select('id', { count: 'exact', head: true }).eq('congregation_id', congregationId),
    supabase.from('territory_sections').select('id', { count: 'exact', head: true }).eq('congregation_id', congregationId),
    supabase.from('territory_blocks').select('id', { count: 'exact', head: true }).eq('congregation_id', congregationId),
    supabase.from('territory_records').select('id', { count: 'exact', head: true }).eq('congregation_id', congregationId),
    supabase
      .from('territory_records')
      .select('id', { count: 'exact', head: true })
      .eq('congregation_id', congregationId)
      .eq('status', 'pending'),
    supabase.from('territory_record_visits').select('id', { count: 'exact', head: true }).eq('congregation_id', congregationId),
    // household_members/plus_code aren't count-only aggregates Supabase's head:true select can
    // compute server-side — fetched and reduced here instead. Fine at a single congregation's
    // scale; worth moving to a Postgres aggregate/RPC if this table ever grows large enough for
    // that to matter.
    supabase.from('territory_records').select('household_members, plus_code').eq('congregation_id', congregationId),
  ])

  const recordFields = (recordAggregateFields.data ?? []) as { household_members: number | null; plus_code: string | null }[]
  const householdMembersTotal = recordFields.reduce((sum, r) => sum + (r.household_members ?? 0), 0)
  const totalHouses = new Set(recordFields.map((r) => r.plus_code).filter((pc): pc is string => Boolean(pc))).size

  return {
    territoryCount: territories.count ?? 0,
    sectionCount: sections.count ?? 0,
    blockCount: blocks.count ?? 0,
    recordCount: records.count ?? 0,
    pendingRecordCount: pendingRecords.count ?? 0,
    visitsLoggedCount: visits.count ?? 0,
    householdMembersTotal,
    totalHouses,
  }
}
