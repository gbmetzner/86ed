import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { membersKey } from '@/lib/rooms'

const TYPING_TTL = 3 // seconds

function typingKey(roomId: string, sessionId: string) {
  return `room:${roomId}:typing:${sessionId}`
}

// POST — signal that the current user is typing
export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const { roomId } = params
  const { sessionId, handle } = await req.json()

  if (!sessionId || !handle) {
    return NextResponse.json({ error: 'sessionId and handle required' }, { status: 400 })
  }

  // Silently drop if the user isn't in the room
  const raw = await redis.hget(membersKey(roomId), sessionId)
  if (!raw) return new NextResponse(null, { status: 204 })

  await redis.set(typingKey(roomId, sessionId), handle, { ex: TYPING_TTL })

  await redis.publish(
    `room:${roomId}:events`,
    JSON.stringify({ type: 'typing', handle }),
  )

  return new NextResponse(null, { status: 204 })
}
