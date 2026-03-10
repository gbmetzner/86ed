/**
 * ioredis wrapper with an API that matches @upstash/redis so the rest of
 * the codebase can run against a local Docker Redis without changes.
 */
import Redis from 'ioredis'

const client = new Redis(process.env.REDIS_URL!, { lazyConnect: false })

const local = {
  async scan(cursor: string, opts: { match: string; count: number }) {
    return client.scan(cursor, 'MATCH', opts.match, 'COUNT', opts.count)
  },

  async mget(...keys: string[]) {
    return client.mget(...keys)
  },

  async smembers(key: string) {
    return client.smembers(key)
  },

  async srem(key: string, ...members: string[]) {
    return client.srem(key, ...members)
  },

  async sadd(key: string, ...members: string[]) {
    return client.sadd(key, ...members)
  },

  async set(key: string, value: string, opts?: { ex?: number }) {
    if (opts?.ex) return client.set(key, value, 'EX', opts.ex)
    return client.set(key, value)
  },

  async get(key: string): Promise<string | null> {
    return client.get(key)
  },

  async exists(key: string) {
    return client.exists(key) as Promise<0 | 1>
  },

  async del(key: string) {
    return client.del(key)
  },

  async hset(key: string, field: string, value: string) {
    return client.hset(key, field, value)
  },

  async hget(key: string, field: string): Promise<string | null> {
    return client.hget(key, field)
  },

  async hgetall(key: string): Promise<Record<string, string> | null> {
    const result = await client.hgetall(key)
    // ioredis returns {} for missing keys; normalise to null
    return Object.keys(result).length === 0 ? null : result
  },

  async hdel(key: string, field: string) {
    return client.hdel(key, field)
  },

  async hlen(key: string) {
    return client.hlen(key)
  },

  async expire(key: string, seconds: number) {
    return client.expire(key, seconds)
  },

  // xadd(key, id, fields, { trim: { type, comparison, threshold } })
  async xadd(
    key: string,
    id: string,
    fields: Record<string, string>,
    opts?: { trim?: { type: string; comparison: string; threshold: number } },
  ) {
    const args: (string | number)[] = []
    if (opts?.trim) {
      args.push(opts.trim.type, opts.trim.comparison, opts.trim.threshold)
    }
    args.push(id)
    for (const [k, v] of Object.entries(fields)) {
      args.push(k, v)
    }
    return client.xadd(key, ...(args as string[]))
  },

  // xread(key, id, { count }) — returns same shape as @upstash/redis raw result
  async xread(
    key: string,
    id: string,
    opts?: { count?: number },
  ) {
    type XReadResult = Promise<[string, [string, string[]][]][] | null>
    if (opts?.count) {
      return client.xread('COUNT', opts.count, 'STREAMS', key, id) as XReadResult
    }
    return client.xread('STREAMS', key, id) as XReadResult
  },

  async publish(channel: string, message: string) {
    return client.publish(channel, message)
  },
}

export default local

export function createSubscriber(): Redis {
  return new Redis(process.env.REDIS_URL!, { lazyConnect: false })
}
