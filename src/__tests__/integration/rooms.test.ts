import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Redis } from 'ioredis'

// ---------------------------------------------------------------------------
// Types for dynamically-imported modules
// ---------------------------------------------------------------------------
type RoomsModule = typeof import('@/lib/rooms')

let container: StartedTestContainer
let redisClient: Redis

let presenceKey: RoomsModule['presenceKey']
let messagesKey: RoomsModule['messagesKey']
let getPresence: RoomsModule['getPresence']
let cleanStaleRooms: RoomsModule['cleanStaleRooms']
let allocateRoom: RoomsModule['allocateRoom']

// ---------------------------------------------------------------------------
// Suite setup — one Redis container shared across all tests in this file
// ---------------------------------------------------------------------------

beforeAll(async () => {
  container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start()

  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`
  process.env.REDIS_URL = url

  // Clear the singleton so redis.ts reconnects with the new URL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any)._redis

  const rooms = await import('@/lib/rooms')
  presenceKey = rooms.presenceKey
  messagesKey = rooms.messagesKey
  getPresence = rooms.getPresence
  cleanStaleRooms = rooms.cleanStaleRooms
  allocateRoom = rooms.allocateRoom

  const { default: redisModule } = await import('@/lib/redis')
  redisClient = redisModule
})

afterAll(async () => {
  await redisClient?.quit()
  await container?.stop()
})

beforeEach(async () => {
  // Flush between tests for isolation
  await redisClient.flushdb()
})

// ---------------------------------------------------------------------------
// Key helpers (pure — but confirm they produce the right Redis keys)
// ---------------------------------------------------------------------------

describe('presenceKey', () => {
  it('produces the expected Redis key', () => {
    expect(presenceKey('room-1', 'sess-1')).toBe('room:room-1:presence:sess-1')
  })
})

describe('messagesKey', () => {
  it('produces the expected Redis key', () => {
    expect(messagesKey('room-1')).toBe('room:room-1:messages')
  })
})

// ---------------------------------------------------------------------------
// getPresence
// ---------------------------------------------------------------------------

describe('getPresence', () => {
  it('returns an empty array for a room with no users', async () => {
    expect(await getPresence('empty-room')).toEqual([])
  })

  it('returns all handles currently in the room', async () => {
    await redisClient.set(presenceKey('room-1', 'sess-1'), 'alice', 'EX', 30)
    await redisClient.set(presenceKey('room-1', 'sess-2'), 'bob', 'EX', 30)

    const handles = await getPresence('room-1')
    expect(handles).toHaveLength(2)
    expect(handles).toContain('alice')
    expect(handles).toContain('bob')
  })

  it('excludes handles whose keys have expired (deleted)', async () => {
    await redisClient.set(presenceKey('room-1', 'sess-1'), 'alice', 'EX', 30)
    await redisClient.set(presenceKey('room-1', 'sess-2'), 'ghost', 'EX', 30)
    // Simulate expiry
    await redisClient.del(presenceKey('room-1', 'sess-2'))

    const handles = await getPresence('room-1')
    expect(handles).toEqual(['alice'])
  })
})

// ---------------------------------------------------------------------------
// cleanStaleRooms
// ---------------------------------------------------------------------------

describe('cleanStaleRooms', () => {
  it('removes stale rooms (no active presence) from rooms:active', async () => {
    await redisClient.sadd('rooms:active', 'stale-room', 'active-room')
    await redisClient.set(presenceKey('active-room', 'sess-1'), 'alice', 'EX', 30)
    // stale-room has no presence keys

    await cleanStaleRooms()

    const remaining = await redisClient.smembers('rooms:active')
    expect(remaining).toContain('active-room')
    expect(remaining).not.toContain('stale-room')
  })

  it('leaves all rooms intact when they all have active users', async () => {
    await redisClient.sadd('rooms:active', 'room-1', 'room-2')
    await redisClient.set(presenceKey('room-1', 'sess-1'), 'alice', 'EX', 30)
    await redisClient.set(presenceKey('room-2', 'sess-2'), 'bob', 'EX', 30)

    await cleanStaleRooms()

    const remaining = await redisClient.smembers('rooms:active')
    expect(remaining).toHaveLength(2)
  })

  it('is a no-op when rooms:active is empty', async () => {
    await cleanStaleRooms() // should not throw
    const remaining = await redisClient.smembers('rooms:active')
    expect(remaining).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// allocateRoom
// ---------------------------------------------------------------------------

describe('allocateRoom', () => {
  it('creates a brand-new room when none exist', async () => {
    const roomId = await allocateRoom('alice', 'sess-1')

    expect(typeof roomId).toBe('string')
    expect(roomId.length).toBeGreaterThan(0)

    const rooms = await redisClient.smembers('rooms:active')
    expect(rooms).toContain(roomId)

    const handle = await redisClient.get(presenceKey(roomId, 'sess-1'))
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
    // Fill a room to capacity (1 via allocateRoom + 5 manually)
    const firstRoomId = await allocateRoom('user1', 'sess-1')
    for (let i = 2; i <= 6; i++) {
      await redisClient.set(presenceKey(firstRoomId, `sess-${i}`), `user${i}`, 'EX', 30)
    }

    const overflowRoomId = await allocateRoom('user7', 'sess-7')
    expect(overflowRoomId).not.toBe(firstRoomId)

    const rooms = await redisClient.smembers('rooms:active')
    expect(rooms).toContain(overflowRoomId)
  })

  it('stores presence with a 30-second TTL', async () => {
    const roomId = await allocateRoom('alice', 'sess-1')
    const ttl = await redisClient.ttl(presenceKey(roomId, 'sess-1'))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(30)
  })
})
