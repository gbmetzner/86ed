import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MessageList from '@/components/MessageList'

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

class MockEventSource {
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: MockEventSource[] = []

  url: string
  readyState = MockEventSource.OPEN
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  close() {
    this.readyState = MockEventSource.CLOSED
  }

  static latest(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1]
  }

  static reset() {
    MockEventSource.instances = []
  }
}

vi.stubGlobal('EventSource', MockEventSource)

function emitMessage(es: MockEventSource, payload: object) {
  es.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageList', () => {
  beforeEach(() => {
    MockEventSource.reset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the empty-state placeholder when there are no messages', () => {
    render(<MessageList roomId="room-1" sessionId="sess-1" />)
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })

  it('opens an SSE connection with the correct URL', () => {
    render(<MessageList roomId="room-1" sessionId="sess-1" />)
    const es = MockEventSource.latest()
    expect(es.url).toContain('/api/stream/room-1')
    expect(es.url).toContain('sessionId=sess-1')
  })

  it('renders messages received from the SSE stream', async () => {
    render(<MessageList roomId="room-1" sessionId="sess-1" />)

    await act(async () => {
      emitMessage(MockEventSource.latest(), {
        id: `${Date.now()}-0`,
        handle: 'alice',
        text: 'hello world',
      })
    })

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders multiple messages in order', async () => {
    render(<MessageList roomId="room-1" sessionId="sess-1" />)
    const es = MockEventSource.latest()
    const now = Date.now()

    await act(async () => {
      emitMessage(es, { id: `${now}-0`, handle: 'alice', text: 'first' })
      emitMessage(es, { id: `${now + 1}-0`, handle: 'bob', text: 'second' })
    })

    const messages = screen.getAllByRole('generic').filter(el =>
      el.textContent === 'first' || el.textContent === 'second',
    )
    expect(messages[0]).toHaveTextContent('first')
    expect(messages[1]).toHaveTextContent('second')
  })

  it('purges messages older than 5 minutes when the expiry interval fires', async () => {
    const oldTs = Date.now() - 6 * 60 * 1000 // 6 minutes ago

    render(<MessageList roomId="room-1" sessionId="sess-1" />)

    await act(async () => {
      emitMessage(MockEventSource.latest(), {
        id: `${oldTs}-0`,
        handle: 'alice',
        text: 'old message',
      })
    })

    expect(screen.getByText('old message')).toBeInTheDocument()

    // Advance past the 30-second expiry interval
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.queryByText('old message')).not.toBeInTheDocument()
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })

  it('keeps messages younger than 5 minutes after the expiry interval fires', async () => {
    const recentTs = Date.now() - 2 * 60 * 1000 // 2 minutes ago

    render(<MessageList roomId="room-1" sessionId="sess-1" />)

    await act(async () => {
      emitMessage(MockEventSource.latest(), {
        id: `${recentTs}-0`,
        handle: 'bob',
        text: 'recent message',
      })
    })

    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.getByText('recent message')).toBeInTheDocument()
  })

  it('closes the EventSource connection on unmount', () => {
    const { unmount } = render(<MessageList roomId="room-1" sessionId="sess-1" />)
    const es = MockEventSource.latest()
    unmount()
    expect(es.readyState).toBe(MockEventSource.CLOSED)
  })
})
