// Six distinct, high-visibility colors suited to the dark pub aesthetic.
// Index 0–5 are assigned at join time so no two users share a color.
export const PALETTE = [
  '#7ba7c7', // slate blue
  '#a07cc8', // violet
  '#7cc8a0', // mint
  '#c87c9a', // rose
  '#c8b87c', // gold
  '#7cc8c0', // teal
]

export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length]
}
