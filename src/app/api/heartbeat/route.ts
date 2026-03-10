import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { membersKey, publishPresence } from '@/lib/rooms'

const PRESENCE_FIELD_TTL_MS = 30_000
const ROOM_HASH_TTL = 90

export async function POST(req: NextRequest) {
  const { roomId, sessionId, handle, colorIndex } = await req.json()

  if (!roomId || !sessionId || !handle || colorIndex === undefined) {
    return NextResponse.json({ error: 'roomId, sessionId, handle, colorIndex required' }, { status: 400 })
  }

  const expiresAt = Date.now() + PRESENCE_FIELD_TTL_MS
  await redis.hset(membersKey(roomId), sessionId, `${handle}:${colorIndex}:${expiresAt}`)
  await redis.expire(membersKey(roomId), ROOM_HASH_TTL)

  // Publish updated presence — also propagates any crashed-user expiries
  await publishPresence(roomId)

  return new NextResponse(null, { status: 200 })
}
