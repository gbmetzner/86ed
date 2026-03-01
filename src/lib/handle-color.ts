// Deterministic colour assignment from a handle string.
// Palette is muted to suit the dark pub aesthetic.
const PALETTE = [
  '#7ba7c7', // slate blue
  '#a07cc8', // violet
  '#7cc8a0', // mint
  '#c87c9a', // rose
  '#c8b87c', // gold
  '#7cc8c0', // teal
]

export function handleColor(handle: string): string {
  let h = 0
  for (let i = 0; i < handle.length; i++) {
    h = (Math.imul(31, h) + handle.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(h) % PALETTE.length]
}
