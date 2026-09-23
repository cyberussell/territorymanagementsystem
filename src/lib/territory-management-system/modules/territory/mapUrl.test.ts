import { describe, expect, it } from 'vitest'
import { territoryMapPathFromUrl } from './queries'

describe('territoryMapPathFromUrl', () => {
  it('extracts the object path from a stored public-form URL, dropping the cache buster', () => {
    expect(
      territoryMapPathFromUrl('https://x.supabase.co/storage/v1/object/public/territory-maps/cong-1/terr-1/map.jpg?v=1786258082096')
    ).toBe('cong-1/terr-1/map.jpg')
  })

  it('returns null for a URL outside the territory-maps bucket', () => {
    expect(territoryMapPathFromUrl('https://example.com/map.jpg')).toBeNull()
  })
})
