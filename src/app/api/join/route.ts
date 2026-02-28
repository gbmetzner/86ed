import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { allocateRoom } from '@/lib/rooms'

export async function POST(req: NextRequest) {
  const { handle } = await req.json()

  if (!handle || typeof handle !== 'string' || handle.trim().length === 0) {
    return NextResponse.json({ error: 'handle required' }, { status: 400 })
  }

  const sessionId = uuidv4()
  const roomId = await allocateRoom(handle.trim(), sessionId)

  return NextResponse.json({ roomId, sessionId })
}
