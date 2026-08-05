export type TerritoryStatus = 'active' | 'inactive'

export interface Territory {
  id: string
  congregation_id: string
  name: string
  description: string
  map_image_url: string | null
  status: TerritoryStatus
  created_at: string
}

export interface TerritorySection {
  id: string
  congregation_id: string
  territory_id: string
  label: string
  sort_order: number
  created_at: string
}

export interface TerritoryBlock {
  id: string
  congregation_id: string
  territory_id: string
  section_id: string
  label: string
  sort_order: number
  created_at: string
}

export interface TerritoryWithCounts extends Territory {
  section_count: number
  block_count: number
  record_count: number
}

export interface TerritoryStructure extends Territory {
  sections: (TerritorySection & { blocks: TerritoryBlock[] })[]
}
