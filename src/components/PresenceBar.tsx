'use client'

import { paletteColor } from '@/lib/handle-color'

interface PresenceEntry {
  handle: string
  colorIndex: number
}

interface Props {
  entries: PresenceEntry[]
  currentHandle: string
}

export default function PresenceBar({ entries, currentHandle }: Props) {
  return (
    <aside className="w-36 shrink-0 border-l border-amber-pub/10 flex flex-col pt-3 px-3 gap-1">
      <p className="text-dim text-[10px] uppercase tracking-widest mb-1 opacity-40">online</p>
      {entries.map(({ handle, colorIndex }) => (
        <span
          key={handle}
          className="text-xs font-medium truncate"
          style={{ color: paletteColor(colorIndex) }}
        >
          {handle === currentHandle ? `${handle} (you)` : handle}
        </span>
      ))}
    </aside>
  )
}
