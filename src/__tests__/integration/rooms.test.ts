import Redis from 'ioredis'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  membersKey,
  messagesKey,
  getPresence,
  cleanStaleRooms,
  allocateRoom,
} from '@/lib/rooms'

// ---------------------------------------------------------------------------
// Use local Redis when REDIS_URL is set (Docker), otherwise skip
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL
const canTest = !!REDIS_URL

const redis = canTest ? new Redis(REDIS_URL!) : null

beforeEach(async () => {
  await redis?.flushdb()
})

afterAll(async () => {
  await redis?.flushdb()
  await redis?.quit()
})

// Helper: write a fresh (non-expired) member directly into the hash
async function writeMember(roomId: string, sessionId: string, handle: string, colorIndex: number) {
  const expiresAt = Date.now() + 30_000
  await redis!.hset(membersKey(roomId), sessionId, `${handle}:${colorIndex}:${expiresAt}`)
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

describe.skipIf(!canTest)('membersKey', () => {
  it('produces the expected Redis key', () => {
    expect(membersKey('room-1')).toBe('room:room-1:members')
  })
})

describe.skipIf(!canTest)('messagesKey', () => {
  it('produces the expected Redis key', () => {
    expect(messagesKey('room-1')).toBe('room:room-1:messages')
  })
})

// ---------------------------------------------------------------------------
// getPresence
// ---------------------------------------------------------------------------

describe.skipIf(!canTest)('getPresence', () => {
  it('returns empty array for a room with no members', async () => {
    expect(await getPresence('empty-room')).toEqual([])
  })

  it('returns all live members in the room', async () => {
    await writeMember('room-1', 'sess-1', 'alice', 0)
    await writeMember('room-1', 'sess-2', 'bob', 1)

    const entries = await getPresence('room-1')
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.handle)).toContain('alice')
    expect(entries.map(e => e.handle)).toContain('bob')
  })

  it('returns correct colorIndex for each member', async () => {
    await writeMember('room-1', 'sess-1', 'alice', 2)
    const entries = await getPresence('room-1')
    expect(entries[0].colorIndex).toBe(2)
  })

  it('excludes members whose expiresAt has passed', async () => {
    const staleAt = Date.now() - 1000
    await redis!.hset(membersKey('room-1'), 'stale-sess', `ghost:0:${staleAt}`)
    await writeMember('room-1', 'fresh-sess', 'alice', 0)

    const entries = await getPresence('room-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].handle).toBe('alice')
  })

  it('removes stale member fields from the hash', async () => {
    const staleAt = Date.now() - 1000
    await redis!.hset(membersKey('room-1'), 'stale-sess', `ghost:0:${staleAt}`)

    await getPresence('room-1')

    // Wait for fire-and-forget HDEL
    await new Promise(r => setTimeout(r, 50))
    const raw = await redis!.hgetall(membersKey('room-1'))
    expect(raw['stale-sess']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// cleanStaleRooms
// ---------------------------------------------------------------------------

describe.skipIf(!canTest)('cleanStaleRooms', () => {
  it('removes stale rooms (no live members) from rooms:active', async () => {
    await redis!.sadd('rooms:active', 'stale-room', 'active-room')
    await writeMember('active-room', 'sess-1', 'alice', 0)

    await cleanStaleRooms()

    const remaining = await redis!.smembers('rooms:active')
    expect(remaining).toContain('active-room')
    expect(remaining).not.toContain('stale-room')
  })

  it('is rate-limited — skips when lock key exists', async () => {
    await redis!.set('rooms:cleanup-lock', '1', 'EX', 60)
    await redis!.sadd('rooms:active', 'orphan-room')

    await cleanStaleRooms()

    // orphan-room should still be in the set because cleanup was skipped
    const rooms = await redis!.smembers('rooms:active')
    expect(rooms).toContain('orphan-room')
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

describe.skipIf(!canTest)('allocateRoom', () => {
  it('creates a brand-new room when none exist', async () => {
    const { roomId, colorIndex } = await allocateRoom('alice', 'sess-1')

    expect(typeof roomId).toBe('string')
    expect(colorIndex).toBe(0)

    const rooms = await redis!.smembers('rooms:active')
    expect(rooms).toContain(roomId)

    const raw = await redis!.hget(membersKey(roomId), 'sess-1')
    expect(raw).toMatch(/^alice:0:\d+$/)
  })

  it('assigns a second user to the same room', async () => {
    const { roomId: first } = await allocateRoom('alice', 'sess-1')
    const { roomId: second, colorIndex } = await allocateRoom('bob', 'sess-2')

    expect(second).toBe(first)
    expect(colorIndex).toBe(1) // slot 0 taken by alice

    const entries = await getPresence(first)
    expect(entries.map(e => e.handle)).toContain('alice')
    expect(entries.map(e => e.handle)).toContain('bob')
  })

  it('creates a new room once the existing room reaches the 6-user limit', async () => {
    const { roomId: firstRoom } = await allocateRoom('user1', 'sess-1')
    for (let i = 2; i <= 6; i++) {
      await writeMember(firstRoom, `sess-${i}`, `user${i}`, i - 1)
    }

    const { roomId: overflowRoom } = await allocateRoom('user7', 'sess-7')
    expect(overflowRoom).not.toBe(firstRoom)

    const rooms = await redis!.smembers('rooms:active')
    expect(rooms).toContain(overflowRoom)
  })

  it('stores presence with an expiry timestamp in the future', async () => {
    const before = Date.now()
    const { roomId } = await allocateRoom('alice', 'sess-1')
    const raw = await redis!.hget(membersKey(roomId), 'sess-1')
    expect(raw).toBeTruthy()

    const expiresAt = parseInt(raw!.split(':').pop()!, 10)
    expect(expiresAt).toBeGreaterThan(before)
    expect(expiresAt).toBeLessThanOrEqual(before + 31_000)
  })

  it('assigns unique color slots — no two users share a color', async () => {
    const { roomId } = await allocateRoom('user0', 'sess-0')
    const colorIndexes: number[] = [0] // first user always gets 0

    for (let i = 1; i <= 5; i++) {
      const { colorIndex } = await allocateRoom(`user${i}`, `sess-${i}`)
      colorIndexes.push(colorIndex)
    }

    expect(new Set(colorIndexes).size).toBe(6) // all unique
  })

  it('sets a TTL on the members hash', async () => {
    const { roomId } = await allocateRoom('alice', 'sess-1')
    const ttl = await redis!.ttl(membersKey(roomId))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(90)
  })
})
