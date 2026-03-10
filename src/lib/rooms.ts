import { v4 as uuidv4 } from 'uuid'
import redis from './redis'

const ROOMS_KEY = 'rooms:active'
const CLEANUP_LOCK_KEY = 'rooms:cleanup-lock'
const MAX_ROOM_SIZE = 6
const PRESENCE_FIELD_TTL_MS = 30_000  // field expires after 30s without heartbeat
const ROOM_HASH_TTL = 90              // hash key expires 90s after last heartbeat
const COLOR_SLOTS = [0, 1, 2, 3, 4, 5]

export interface PresenceEntry {
  sessionId: string
  handle: string
  colorIndex: number
}

export function membersKey(roomId: string): string {
  return `room:${roomId}:members`
}

export function messagesKey(roomId: string): string {
  return `room:${roomId}:messages`
}

function encodeField(handle: string, colorIndex: number): string {
  const expiresAt = Date.now() + PRESENCE_FIELD_TTL_MS
  return `${handle}:${colorIndex}:${expiresAt}`
}

function decodeField(sessionId: string, value: string): PresenceEntry | null {
  // Format: "handle:colorIndex:expiresAt"
  // Use lastIndexOf twice to handle handles that contain ':'
  const lastColon = value.lastIndexOf(':')
  const expiresAt = parseInt(value.slice(lastColon + 1), 10)
  if (isNaN(expiresAt) || Date.now() > expiresAt) return null

  const rest = value.slice(0, lastColon)
  const secondLastColon = rest.lastIndexOf(':')
  const colorIndex = parseInt(rest.slice(secondLastColon + 1), 10)
  const handle = rest.slice(0, secondLastColon)

  return { sessionId, handle, colorIndex }
}

/**
 * Return all live (non-expired) presence entries for a room.
 * Stale entries are removed from the hash as a side-effect.
 */
export async function getPresence(roomId: string): Promise<PresenceEntry[]> {
  const raw = await redis.hgetall(membersKey(roomId))
  if (!raw) return []

  const entries: PresenceEntry[] = []
  const stale: string[] = []

  for (const [sessionId, value] of Object.entries(raw)) {
    const entry = decodeField(sessionId, value)
    if (entry) {
      entries.push(entry)
    } else {
      stale.push(sessionId)
    }
  }

  // Clean up stale fields (fire-and-forget, non-blocking)
  for (const sid of stale) {
    redis.hdel(membersKey(roomId), sid).catch(() => {})
  }

  return entries
}

/**
 * Publish the current live presence to the room's SSE channel.
 * Called after any membership change (join, leave, heartbeat).
 */
export async function publishPresence(roomId: string): Promise<void> {
  const entries = await getPresence(roomId)
  const handles = entries.map(({ handle, colorIndex }) => ({ handle, colorIndex }))
  await redis.publish(
    `room:${roomId}:events`,
    JSON.stringify({ type: 'presence', handles }),
  )
}

/** Remove stale rooms from rooms:active. Rate-limited to once per 60s. */
export async function cleanStaleRooms(): Promise<void> {
  // Rate-limit: skip if the lock key exists
  const locked = await redis.get(CLEANUP_LOCK_KEY)
  if (locked) return

  await redis.set(CLEANUP_LOCK_KEY, '1', { ex: 60 })

  const roomIds = await redis.smembers(ROOMS_KEY)
  for (const roomId of roomIds) {
    const entries = await getPresence(roomId)
    if (entries.length === 0) {
      await redis.srem(ROOMS_KEY, roomId)
    }
  }
}

/**
 * Find or create a room with space, assign a unique color slot,
 * register presence, and return roomId + colorIndex.
 */
export async function allocateRoom(
  handle: string,
  sessionId: string,
): Promise<{ roomId: string; colorIndex: number }> {
  await cleanStaleRooms()

  const roomIds = await redis.smembers(ROOMS_KEY)

  for (const roomId of roomIds) {
    const entries = await getPresence(roomId)
    if (entries.length < MAX_ROOM_SIZE) {
      const taken = new Set(entries.map(e => e.colorIndex))
      const colorIndex = COLOR_SLOTS.find(i => !taken.has(i)) ?? 0
      await redis.hset(membersKey(roomId), sessionId, encodeField(handle, colorIndex))
      await redis.expire(membersKey(roomId), ROOM_HASH_TTL)
      return { roomId, colorIndex }
    }
  }

  // All rooms full — create a new one
  const newRoomId = uuidv4()
  await redis.sadd(ROOMS_KEY, newRoomId)
  await redis.hset(membersKey(newRoomId), sessionId, encodeField(handle, 0))
  await redis.expire(membersKey(newRoomId), ROOM_HASH_TTL)
  return { roomId: newRoomId, colorIndex: 0 }
}
