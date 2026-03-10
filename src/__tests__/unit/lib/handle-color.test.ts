import { describe, it, expect } from 'vitest'
import { PALETTE, paletteColor } from '@/lib/handle-color'

describe('PALETTE', () => {
  it('has exactly 6 colors', () => {
    expect(PALETTE).toHaveLength(6)
  })

  it('contains only valid hex colors', () => {
    PALETTE.forEach(color => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })

  it('has no duplicate colors', () => {
    expect(new Set(PALETTE).size).toBe(6)
  })
})

describe('paletteColor', () => {
  it('returns the color at the given index', () => {
    expect(paletteColor(0)).toBe(PALETTE[0])
    expect(paletteColor(1)).toBe(PALETTE[1])
    expect(paletteColor(5)).toBe(PALETTE[5])
  })

  it('wraps around for indices >= 6', () => {
    expect(paletteColor(6)).toBe(PALETTE[0])
    expect(paletteColor(7)).toBe(PALETTE[1])
  })
})
