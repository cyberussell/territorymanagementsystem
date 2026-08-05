import { z } from 'zod'

// Shared by actions/territories.ts and TerritoryForm's zodResolver.

// name/description are still the underlying field names (no DB migration) — only their labels
// changed in the UI, to "Territory Number" and "Barangay Name" respectively. Barangay Name
// (description) is now required, everywhere — including editing an existing territory that
// predates this change and has no barangay set, per Russell's explicit choice not to grandfather
// old rows in.
export const createTerritorySchema = z.object({
  name: z.string().min(1, 'Territory Number is required.').max(120),
  description: z.string().min(1, 'Barangay Name is required.').max(500),
  sectionCount: z.coerce.number().int().min(1).max(100),
  blocksPerSection: z.coerce.number().int().min(1).max(100),
})
export type CreateTerritoryInput = z.input<typeof createTerritorySchema>

export const updateTerritorySchema = z.object({
  territoryId: z.string().uuid(),
  name: z.string().min(1, 'Territory Number is required.').max(120),
  description: z.string().min(1, 'Barangay Name is required.').max(500),
  status: z.enum(['active', 'inactive']),
})
export type UpdateTerritoryInput = z.input<typeof updateTerritorySchema>

export const addSectionSchema = z.object({
  territoryId: z.string().uuid(),
})

export const addBlockSchema = z.object({
  territoryId: z.string().uuid(),
  sectionId: z.string().uuid(),
})

export const MAP_MAX_BYTES = 5 * 1024 * 1024
