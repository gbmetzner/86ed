import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { presenceKey } from '@/lib/rooms'

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

  // Silently drop if the user isn't in the room (e.g. expired presence)
  const isPresent = await redis.exists(presenceKey(roomId, sessionId))
  if (!isPresent) return new NextResponse(null, { status: 204 })

  await redis.set(typingKey(roomId, sessionId), handle, 'EX', TYPING_TTL)
  return new NextResponse(null, { status: 204 })
}

// GET — return who is currently typing (excluding the caller)
export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const { roomId } = params
  const selfSessionId = req.nextUrl.searchParams.get('sessionId') ?? ''

  const pattern = `room:${roomId}:typing:*`
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, found] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = next
    keys.push(...found)
  } while (cursor !== '0')

  const otherKeys = keys.filter(k => !k.endsWith(`:${selfSessionId}`))
  if (otherKeys.length === 0) return NextResponse.json({ handles: [] })

  const values = await redis.mget(...otherKeys)
  const handles = values.filter((v): v is string => v !== null)
  return NextResponse.json({ handles })
}
