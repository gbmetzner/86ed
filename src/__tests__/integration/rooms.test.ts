import { Redis } from '@upstash/redis'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { presenceKey, messagesKey, getPresence, cleanStaleRooms, allocateRoom } from '@/lib/rooms'

// ---------------------------------------------------------------------------
// Skip the entire suite when Upstash credentials are not configured.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to run these tests.
// ---------------------------------------------------------------------------

const hasUpstash = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

const redis = hasUpstash
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null

beforeEach(async () => {
  await redis?.flushdb()
})

afterAll(async () => {
  await redis?.flushdb()
})

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('presenceKey', () => {
  it('produces the expected Redis key', () => {
    expect(presenceKey('room-1', 'sess-1')).toBe('room:room-1:presence:sess-1')
  })
})

describe.skipIf(!hasUpstash)('messagesKey', () => {
  it('produces the expected Redis key', () => {
    expect(messagesKey('room-1')).toBe('room:room-1:messages')
  })
})

// ---------------------------------------------------------------------------
// getPresence
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('getPresence', () => {
  it('returns an empty array for a room with no users', async () => {
    expect(await getPresence('empty-room')).toEqual([])
  })

  it('returns all handles currently in the room', async () => {
    await redis!.set(presenceKey('room-1', 'sess-1'), 'alice', { ex: 30 })
    await redis!.set(presenceKey('room-1', 'sess-2'), 'bob', { ex: 30 })

    const handles = await getPresence('room-1')
    expect(handles).toHaveLength(2)
    expect(handles).toContain('alice')
    expect(handles).toContain('bob')
  })

  it('excludes handles whose keys have expired (deleted)', async () => {
    await redis!.set(presenceKey('room-1', 'sess-1'), 'alice', { ex: 30 })
    await redis!.set(presenceKey('room-1', 'sess-2'), 'ghost', { ex: 30 })
    await redis!.del(presenceKey('room-1', 'sess-2'))

    const handles = await getPresence('room-1')
    expect(handles).toEqual(['alice'])
  })
})

// ---------------------------------------------------------------------------
// cleanStaleRooms
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('cleanStaleRooms', () => {
  it('removes stale rooms (no active presence) from rooms:active', async () => {
    await redis!.sadd('rooms:active', 'stale-room', 'active-room')
    await redis!.set(presenceKey('active-room', 'sess-1'), 'alice', { ex: 30 })

    await cleanStaleRooms()

    const remaining = await redis!.smembers('rooms:active')
    expect(remaining).toContain('active-room')
    expect(remaining).not.toContain('stale-room')
  })

  it('leaves all rooms intact when they all have active users', async () => {
    await redis!.sadd('rooms:active', 'room-1', 'room-2')
    await redis!.set(presenceKey('room-1', 'sess-1'), 'alice', { ex: 30 })
    await redis!.set(presenceKey('room-2', 'sess-2'), 'bob', { ex: 30 })

    await cleanStaleRooms()

    const remaining = await redis!.smembers('rooms:active')
    expect(remaining).toHaveLength(2)
  })

  it('is a no-op when rooms:active is empty', async () => {
    await cleanStaleRooms()
    const remaining = await redis!.smembers('rooms:active')
    expect(remaining).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// allocateRoom
// ---------------------------------------------------------------------------

describe.skipIf(!hasUpstash)('allocateRoom', () => {
  it('creates a brand-new room when none exist', async () => {
    const roomId = await allocateRoom('alice', 'sess-1')

    expect(typeof roomId).toBe('string')
    expect(roomId.length).toBeGreaterThan(0)

    const rooms = await redis!.smembers('rooms:active')
    expect(rooms).toContain(roomId)

    const handle = await redis!.get(presenceKey(roomId, 'sess-1'))
    expect(handle).toBe('alice')
  })

  it('assigns a second user to the same room', async () => {
    const firstRoomId = await allocateRoom('alice', 'sess-1')
    const secondRoomId = await allocateRoom('bob', 'sess-2')

    expect(secondRoomId).toBe(firstRoomId)

    const handles = await getPresence(firstRoomId)
    expect(handles).toContain('alice')
    expect(handles).toContain('bob')
  })

  it('creates a new room once the existing room reaches the 6-user limit', async () => {
    const firstRoomId = await allocateRoom('user1', 'sess-1')
    for (let i = 2; i <= 6; i++) {
      await redis!.set(presenceKey(firstRoomId, `sess-${i}`), `user${i}`, { ex: 30 })
    }

    const overflowRoomId = await allocateRoom('user7', 'sess-7')
    expect(overflowRoomId).not.toBe(firstRoomId)

    const rooms = await redis!.smembers('rooms:active')
    expect(rooms).toContain(overflowRoomId)
  })

  it('stores presence with a 30-second TTL', async () => {
    const roomId = await allocateRoom('alice', 'sess-1')
    const ttl = await redis!.ttl(presenceKey(roomId, 'sess-1'))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(30)
  })
})
