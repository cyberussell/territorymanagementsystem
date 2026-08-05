'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import {
  addBlockSchema,
  addSectionSchema,
  createTerritorySchema,
  MAP_MAX_BYTES,
  updateTerritorySchema,
} from '@/lib/territory-management-system/modules/territory/schema'
import * as territoryQueries from '@/lib/territory-management-system/modules/territory/queries'
import { type ActionResult } from './shared'

export async function createTerritory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = createTerritorySchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description'),
    sectionCount: formData.get('sectionCount'),
    blocksPerSection: formData.get('blocksPerSection'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in all fields correctly.' }

  const { supabase, congregation } = await requireAdmin()
  let territoryId: string
  try {
    territoryId = await territoryQueries.createTerritoryStructure(supabase, congregation.id, parsed.data)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create the territory.' }
  }

  revalidatePath('/tms/dashboard/territories')
  redirect(`/tms/dashboard/territories/${territoryId}`)
}

export async function updateTerritoryDetails(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = updateTerritorySchema.safeParse({
    territoryId: formData.get('territoryId'),
    name: formData.get('name'),
    description: formData.get('description'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please fill in all fields correctly.' }
  const { territoryId, ...updates } = parsed.data

  const { supabase } = await requireAdmin()
  try {
    await territoryQueries.updateTerritory(supabase, territoryId, updates)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update the territory.' }
  }

  revalidatePath(`/tms/dashboard/territories/${territoryId}`)
  return { error: 'SAVED' }
}

export async function deleteTerritoryAction(territoryId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await territoryQueries.deleteTerritory(supabase, territoryId)
  revalidatePath('/tms/dashboard/territories')
  redirect('/tms/dashboard/territories')
}

export async function addSectionAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = addSectionSchema.safeParse({ territoryId: formData.get('territoryId') })
  if (!parsed.success) return { error: 'Invalid request.' }

  const { supabase, congregation } = await requireAdmin()
  try {
    await territoryQueries.addSection(supabase, congregation.id, parsed.data.territoryId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not add a section.' }
  }

  revalidatePath(`/tms/dashboard/territories/${parsed.data.territoryId}`)
  return { error: 'SAVED' }
}

export async function addBlockAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = addBlockSchema.safeParse({
    territoryId: formData.get('territoryId'),
    sectionId: formData.get('sectionId'),
  })
  if (!parsed.success) return { error: 'Invalid request.' }

  const { supabase, congregation } = await requireAdmin()
  try {
    await territoryQueries.addBlock(supabase, congregation.id, parsed.data.territoryId, parsed.data.sectionId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not add a block.' }
  }

  revalidatePath(`/tms/dashboard/territories/${parsed.data.territoryId}`)
  return { error: 'SAVED' }
}

export async function deleteSectionAction(sectionId: string, territoryId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await territoryQueries.deleteSection(supabase, sectionId)
  revalidatePath(`/tms/dashboard/territories/${territoryId}`)
}

export async function deleteBlockAction(blockId: string, territoryId: string): Promise<void> {
  const { supabase } = await requireAdmin()
  await territoryQueries.deleteBlock(supabase, blockId)
  revalidatePath(`/tms/dashboard/territories/${territoryId}`)
}

export async function uploadTerritoryMapAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const territoryId = String(formData.get('territoryId') ?? '')
  const file = formData.get('map')
  if (!territoryId) return { error: 'Invalid request.' }
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a JPG or PNG image to upload.' }
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') return { error: 'Territory map must be a JPG or PNG image.' }
  if (file.size > MAP_MAX_BYTES) return { error: 'Map image must be under 5MB.' }

  const { supabase, congregation } = await requireAdmin()
  try {
    await territoryQueries.uploadTerritoryMap(supabase, congregation.id, territoryId, file)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not upload the map.' }
  }

  revalidatePath(`/tms/dashboard/territories/${territoryId}`)
  return { error: 'SAVED' }
}
