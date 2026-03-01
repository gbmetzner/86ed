import { v4 as uuidv4 } from 'uuid'
import redis from './redis'

const ROOMS_KEY = 'rooms:active'
const MAX_ROOM_SIZE = 6
const PRESENCE_TTL = 30 // seconds

export function presenceKey(roomId: string, sessionId: string) {
  return `room:${roomId}:presence:${sessionId}`
}

export function messagesKey(roomId: string) {
  return `room:${roomId}:messages`
}

/** Return all session handles currently present in a room. */
export async function getPresence(roomId: string): Promise<string[]> {
  const pattern = `room:${roomId}:presence:*`
  const keys: string[] = []

  let cursor: number | string = 0
  do {
    const [next, found] = await redis.scan(cursor as number, { match: pattern, count: 100 })
    cursor = next
    keys.push(...found)
  } while (Number(cursor) !== 0)

  if (keys.length === 0) return []
  const values = await redis.mget(...keys)
  return values.filter((v): v is string => v !== null)
}

/** Remove rooms from rooms:active that have zero live presence keys. */
export async function cleanStaleRooms(): Promise<void> {
  const roomIds = await redis.smembers(ROOMS_KEY)
  for (const roomId of roomIds) {
    const pattern = `room:${roomId}:presence:*`
    const [, keys] = await redis.scan(0, { match: pattern, count: 100 })
    if (keys.length === 0) {
      await redis.srem(ROOMS_KEY, roomId)
    }
  }
}

/**
 * Find or create a room with space, register presence, return roomId.
 */
export async function allocateRoom(
  handle: string,
  sessionId: string,
): Promise<string> {
  await cleanStaleRooms()

  const roomIds = await redis.smembers(ROOMS_KEY)

  for (const roomId of roomIds) {
    const handles = await getPresence(roomId)
    if (handles.length < MAX_ROOM_SIZE) {
      await redis.set(presenceKey(roomId, sessionId), handle, { ex: PRESENCE_TTL })
      return roomId
    }
  }

  // All rooms full — create a new one
  const newRoomId = uuidv4()
  await redis.sadd(ROOMS_KEY, newRoomId)
  await redis.set(presenceKey(newRoomId, sessionId), handle, { ex: PRESENCE_TTL })
  return newRoomId
}
