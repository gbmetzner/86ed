import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/redis', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
    smembers: vi.fn(),
    srem: vi.fn(),
    sadd: vi.fn(),
    hset: vi.fn(),
    hget: vi.fn(),
    hgetall: vi.fn(),
    hdel: vi.fn(),
    hlen: vi.fn(),
    expire: vi.fn(),
    publish: vi.fn(),
  },
}))

import redis from '@/lib/redis'
import {
  membersKey,
  messagesKey,
  getPresence,
  cleanStaleRooms,
  allocateRoom,
  publishPresence,
} from '@/lib/rooms'

const r = vi.mocked(redis)

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

describe('membersKey', () => {
  it('formats the members key correctly', () => {
    expect(membersKey('room-abc')).toBe('room:room-abc:members')
  })
})

describe('messagesKey', () => {
  it('formats the messages key correctly', () => {
    expect(messagesKey('room-abc')).toBe('room:room-abc:messages')
  })
})

// ---------------------------------------------------------------------------
// getPresence
// ---------------------------------------------------------------------------

describe('getPresence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when hash is empty/missing', async () => {
    r.hgetall.mockResolvedValue(null)
    expect(await getPresence('room-1')).toEqual([])
  })

  it('returns live entries parsed from hash fields', async () => {
    const expiresAt = Date.now() + 20_000
    r.hgetall.mockResolvedValue({
      'sess-1': `alice:0:${expiresAt}`,
      'sess-2': `bob:1:${expiresAt}`,
    })
    const entries = await getPresence('room-1')
    expect(entries).toHaveLength(2)
    expect(entries).toContainEqual({ sessionId: 'sess-1', handle: 'alice', colorIndex: 0 })
    expect(entries).toContainEqual({ sessionId: 'sess-2', handle: 'bob', colorIndex: 1 })
  })

  it('filters out expired entries and schedules HDEL', async () => {
    const staleAt = Date.now() - 1000
    const freshAt = Date.now() + 20_000
    r.hgetall.mockResolvedValue({
      'sess-stale': `ghost:2:${staleAt}`,
      'sess-fresh': `alice:0:${freshAt}`,
    })
    r.hdel.mockResolvedValue(1)

    const entries = await getPresence('room-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].handle).toBe('alice')

    // Wait a tick for the fire-and-forget HDEL
    await new Promise(r => setTimeout(r, 0))
    expect(r.hdel).toHaveBeenCalledWith('room:room-1:members', 'sess-stale')
  })

  it('handles handles containing colons', async () => {
    const expiresAt = Date.now() + 20_000
    r.hgetall.mockResolvedValue({ 'sess-1': `user:name:0:${expiresAt}` })
    const entries = await getPresence('room-1')
    expect(entries[0].handle).toBe('user:name')
    expect(entries[0].colorIndex).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// cleanStaleRooms
// ---------------------------------------------------------------------------

describe('cleanStaleRooms', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when the cleanup lock key exists', async () => {
    r.get.mockResolvedValue('1')
    await cleanStaleRooms()
    expect(r.smembers).not.toHaveBeenCalled()
  })

  it('removes rooms with no live members', async () => {
    r.get.mockResolvedValue(null)
    r.set.mockResolvedValue('OK')
    r.smembers.mockResolvedValue(['empty-room'])
    r.hgetall.mockResolvedValue(null)
    r.srem.mockResolvedValue(1)

    await cleanStaleRooms()

    expect(r.srem).toHaveBeenCalledWith('rooms:active', 'empty-room')
  })

  it('keeps rooms that have live members', async () => {
    const expiresAt = Date.now() + 20_000
    r.get.mockResolvedValue(null)
    r.set.mockResolvedValue('OK')
    r.smembers.mockResolvedValue(['active-room'])
    r.hgetall.mockResolvedValue({ 'sess-1': `alice:0:${expiresAt}` })

    await cleanStaleRooms()

    expect(r.srem).not.toHaveBeenCalled()
  })

  it('is a no-op when rooms:active is empty', async () => {
    r.get.mockResolvedValue(null)
    r.set.mockResolvedValue('OK')
    r.smembers.mockResolvedValue([])

    await cleanStaleRooms()

    expect(r.srem).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// allocateRoom
// ---------------------------------------------------------------------------

describe('allocateRoom', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new room when no rooms exist', async () => {
    r.get.mockResolvedValue(null)
    r.set.mockResolvedValue('OK')
    r.smembers.mockResolvedValue([])
    r.hset.mockResolvedValue(1)
    r.expire.mockResolvedValue(1)
    r.sadd.mockResolvedValue(1)

    const { roomId, colorIndex } = await allocateRoom('alice', 'sess-1')

    expect(typeof roomId).toBe('string')
    expect(colorIndex).toBe(0)
    expect(r.sadd).toHaveBeenCalledWith('rooms:active', roomId)
    expect(r.hset).toHaveBeenCalledWith(
      `room:${roomId}:members`,
      'sess-1',
      expect.stringMatching(/^alice:0:\d+$/),
    )
  })

  it('joins an existing room that has space', async () => {
    const expiresAt = Date.now() + 20_000
    r.get.mockResolvedValue(null)
    r.set.mockResolvedValue('OK')
    r.smembers
      .mockResolvedValueOnce([])           // cleanStaleRooms
      .mockResolvedValueOnce(['room-xyz']) // allocateRoom
    r.hgetall.mockResolvedValue({ 'sess-1': `alice:0:${expiresAt}` })
    r.hset.mockResolvedValue(1)
    r.expire.mockResolvedValue(1)

    const { roomId, colorIndex } = await allocateRoom('bob', 'sess-2')

    expect(roomId).toBe('room-xyz')
    expect(colorIndex).toBe(1) // slot 0 taken by alice, gets slot 1
    expect(r.sadd).not.toHaveBeenCalled()
  })

  it('assigns unique color slots to each user', async () => {
    const expiresAt = Date.now() + 20_000
    const existingMembers: Record<string, string> = {
      's0': `u0:0:${expiresAt}`,
      's1': `u1:1:${expiresAt}`,
      's2': `u2:2:${expiresAt}`,
    }
    r.get.mockResolvedValue(null)
    r.set.mockResolvedValue('OK')
    r.smembers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['room-abc'])
    r.hgetall.mockResolvedValue(existingMembers)
    r.hset.mockResolvedValue(1)
    r.expire.mockResolvedValue(1)

    const { colorIndex } = await allocateRoom('new-user', 'new-sess')

    expect([3, 4, 5]).toContain(colorIndex)
  })

  it('creates a new room when all existing rooms are full', async () => {
    const expiresAt = Date.now() + 20_000
    const fullRoom: Record<string, string> = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`s${i}`, `user${i}:${i}:${expiresAt}`])
    )
    r.get.mockResolvedValue(null)
    r.set.mockResolvedValue('OK')
    r.smembers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['full-room'])
    r.hgetall.mockResolvedValue(fullRoom)
    r.hset.mockResolvedValue(1)
    r.expire.mockResolvedValue(1)
    r.sadd.mockResolvedValue(1)

    const { roomId } = await allocateRoom('overflow', 'new-sess')

    expect(roomId).not.toBe('full-room')
    expect(r.sadd).toHaveBeenCalledWith('rooms:active', roomId)
  })
})

// ---------------------------------------------------------------------------
// publishPresence
// ---------------------------------------------------------------------------

describe('publishPresence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('publishes presence event with current live members', async () => {
    const expiresAt = Date.now() + 20_000
    r.hgetall.mockResolvedValue({
      'sess-1': `alice:0:${expiresAt}`,
      'sess-2': `bob:1:${expiresAt}`,
    })
    r.publish.mockResolvedValue(1)

    await publishPresence('room-1')

    expect(r.publish).toHaveBeenCalledWith(
      'room:room-1:events',
      expect.stringContaining('"type":"presence"'),
    )

    const payload = JSON.parse((r.publish as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(payload.handles).toHaveLength(2)
    expect(payload.handles).toContainEqual({ handle: 'alice', colorIndex: 0 })
    expect(payload.handles).toContainEqual({ handle: 'bob', colorIndex: 1 })
  })

  it('publishes empty handles when room is empty', async () => {
    r.hgetall.mockResolvedValue(null)
    r.publish.mockResolvedValue(0)

    await publishPresence('room-1')

    const payload = JSON.parse((r.publish as ReturnType<typeof vi.fn>).mock.calls[0][1])
    expect(payload.handles).toEqual([])
  })
})
