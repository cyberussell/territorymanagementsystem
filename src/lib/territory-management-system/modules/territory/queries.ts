import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Territory, TerritoryBlock, TerritorySection, TerritoryStructure, TerritoryWithCounts } from './types'
import { blockLabel, sectionLabel } from './labels'

export async function listTerritories(supabase: SupabaseClient, congregationId: string): Promise<TerritoryWithCounts[]> {
  const { data: territories } = await supabase
    .from('territories')
    .select('*')
    .eq('congregation_id', congregationId)
    .order('created_at', { ascending: false })
  if (!territories || territories.length === 0) return []

  const territoryIds = territories.map((t) => t.id)
  const [{ data: sections }, { data: blocks }, { data: records }] = await Promise.all([
    supabase.from('territory_sections').select('id, territory_id').in('territory_id', territoryIds),
    supabase.from('territory_blocks').select('id, territory_id').in('territory_id', territoryIds),
    supabase.from('territory_records').select('id, territory_id').in('territory_id', territoryIds),
  ])

  return territories.map((t) => ({
    ...(t as Territory),
    section_count: (sections ?? []).filter((s) => s.territory_id === t.id).length,
    block_count: (blocks ?? []).filter((b) => b.territory_id === t.id).length,
    record_count: (records ?? []).filter((r) => r.territory_id === t.id).length,
  }))
}

export async function getTerritoryStructure(
  supabase: SupabaseClient,
  congregationId: string,
  territoryId: string
): Promise<TerritoryStructure | null> {
  const { data: territory } = await supabase
    .from('territories')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('id', territoryId)
    .maybeSingle()
  if (!territory) return null

  const [{ data: sections }, { data: blocks }] = await Promise.all([
    supabase.from('territory_sections').select('*').eq('territory_id', territoryId).order('sort_order'),
    supabase.from('territory_blocks').select('*').eq('territory_id', territoryId).order('sort_order'),
  ])

  const sectionsWithBlocks = (sections ?? []).map((s) => ({
    ...(s as TerritorySection),
    blocks: (blocks ?? []).filter((b) => b.section_id === s.id) as TerritoryBlock[],
  }))

  return { ...(territory as Territory), sections: sectionsWithBlocks }
}

export async function createTerritoryStructure(
  supabase: SupabaseClient,
  congregationId: string,
  input: { name: string; description: string; sectionCount: number; blocksPerSection: number }
): Promise<string> {
  const { data, error } = await supabase.rpc('create_territory_structure', {
    p_congregation_id: congregationId,
    p_name: input.name,
    p_description: input.description,
    p_section_count: input.sectionCount,
    p_blocks_per_section: input.blocksPerSection,
  })
  if (error) throw error
  return data as string
}

export async function updateTerritory(
  supabase: SupabaseClient,
  territoryId: string,
  updates: { name: string; description: string; status: 'active' | 'inactive' }
): Promise<void> {
  const { error } = await supabase.from('territories').update(updates).eq('id', territoryId)
  if (error) throw error
}

export async function deleteTerritory(supabase: SupabaseClient, territoryId: string): Promise<void> {
  const { error } = await supabase.from('territories').delete().eq('id', territoryId)
  if (error) throw error
}

export async function updateTerritoryMapImage(
  supabase: SupabaseClient,
  territoryId: string,
  mapImageUrl: string | null
): Promise<void> {
  const { error } = await supabase.from('territories').update({ map_image_url: mapImageUrl }).eq('id', territoryId)
  if (error) throw error
}

// RLS alone only checks that the caller is an admin of `congregation_id` on the row being
// written — it never verifies a client-supplied territoryId/sectionId actually belongs to
// that congregation. Without this, a tampered hidden form field could plant a section/block
// under another congregation's territory (still invisible to the attacker thanks to RLS on
// read, but real data corruption). Every insert that accepts a client-supplied parent id
// checks ownership first, mirroring the pattern already required for the publisher flow
// (which has no RLS to fall back on at all).
async function assertTerritoryOwnership(supabase: SupabaseClient, congregationId: string, territoryId: string): Promise<void> {
  const { data } = await supabase.from('territories').select('id').eq('congregation_id', congregationId).eq('id', territoryId).maybeSingle()
  if (!data) throw new Error('Territory not found.')
}

async function assertSectionOwnership(supabase: SupabaseClient, congregationId: string, sectionId: string): Promise<void> {
  const { data } = await supabase.from('territory_sections').select('id').eq('congregation_id', congregationId).eq('id', sectionId).maybeSingle()
  if (!data) throw new Error('Section not found.')
}

export async function addSection(
  supabase: SupabaseClient,
  congregationId: string,
  territoryId: string
): Promise<TerritorySection> {
  await assertTerritoryOwnership(supabase, congregationId, territoryId)
  const { count } = await supabase
    .from('territory_sections')
    .select('id', { count: 'exact', head: true })
    .eq('territory_id', territoryId)
  const nextIndex = (count ?? 0) + 1
  const { data, error } = await supabase
    .from('territory_sections')
    .insert({
      congregation_id: congregationId,
      territory_id: territoryId,
      label: sectionLabel(nextIndex),
      sort_order: nextIndex,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as TerritorySection
}

export async function addBlock(
  supabase: SupabaseClient,
  congregationId: string,
  territoryId: string,
  sectionId: string
): Promise<TerritoryBlock> {
  await assertTerritoryOwnership(supabase, congregationId, territoryId)
  await assertSectionOwnership(supabase, congregationId, sectionId)
  const { count } = await supabase
    .from('territory_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('section_id', sectionId)
  const nextIndex = (count ?? 0) + 1
  const { data, error } = await supabase
    .from('territory_blocks')
    .insert({
      congregation_id: congregationId,
      territory_id: territoryId,
      section_id: sectionId,
      label: blockLabel(nextIndex),
      sort_order: nextIndex,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as TerritoryBlock
}

export async function deleteSection(supabase: SupabaseClient, sectionId: string): Promise<void> {
  const { error } = await supabase.from('territory_sections').delete().eq('id', sectionId)
  if (error) throw error
}

export async function deleteBlock(supabase: SupabaseClient, blockId: string): Promise<void> {
  const { error } = await supabase.from('territory_blocks').delete().eq('id', blockId)
  if (error) throw error
}

const MAP_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

// One map image per territory — clears whatever's already in the territory's folder first,
// same pattern as LMS's business logo upload, scoped one level deeper (congregation/territory).
export async function uploadTerritoryMap(
  supabase: SupabaseClient,
  congregationId: string,
  territoryId: string,
  file: File
): Promise<string> {
  const extension = MAP_EXTENSIONS[file.type]
  if (!extension) throw new Error('Territory map must be a JPG image.')

  const folder = `${congregationId}/${territoryId}`
  const { data: existing } = await supabase.storage.from('territory-maps').list(folder)
  if (existing && existing.length > 0) {
    await supabase.storage.from('territory-maps').remove(existing.map((f) => `${folder}/${f.name}`))
  }

  const path = `${folder}/map.${extension}`
  const { error: uploadError } = await supabase.storage.from('territory-maps').upload(path, file, { contentType: file.type })
  if (uploadError) throw uploadError

  const { data: publicUrl } = supabase.storage.from('territory-maps').getPublicUrl(path)
  // Cache-bust so the new map shows immediately even though the path is unchanged.
  const mapUrl = `${publicUrl.publicUrl}?v=${Date.now()}`
  await updateTerritoryMapImage(supabase, territoryId, mapUrl)
  return mapUrl
}
