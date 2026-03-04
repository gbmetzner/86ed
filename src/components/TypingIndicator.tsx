'use client'

interface Props {
  handles: string[]
}

export default function TypingIndicator({ handles }: Props) {
  if (handles.length === 0) return null

  const names = handles.slice(0, 3)
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are typing`

  return (
    <div className="px-4 py-1 text-xs text-dim opacity-50 italic select-none">
      {label}…
    </div>
  )
}
