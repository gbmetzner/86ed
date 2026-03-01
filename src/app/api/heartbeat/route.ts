import { NextRequest, NextResponse } from 'next/server'
import redis from '@/lib/redis'
import { presenceKey } from '@/lib/rooms'

export async function POST(req: NextRequest) {
  const { roomId, sessionId, handle } = await req.json()

  if (!roomId || !sessionId || !handle) {
    return NextResponse.json({ error: 'roomId, sessionId, handle required' }, { status: 400 })
  }

  await redis.set(presenceKey(roomId, sessionId), handle, { ex: 30 })
  return new NextResponse(null, { status: 200 })
}
