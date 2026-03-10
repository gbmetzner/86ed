import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import MessageList from '@/components/MessageList'

function renderML(handle = 'gustavo') {
  const onSseEvent = React.createRef<((e: MessageEvent) => void) | null>() as
    React.MutableRefObject<((e: MessageEvent) => void) | null>
  onSseEvent.current = null
  const utils = render(
    <MessageList
      roomId="room-1"
      sessionId="sess-1"
      handle={handle}
      colorIndex={0}
      soundEnabled={false}
      onSseEvent={onSseEvent}
    />,
  )
  return { ...utils, onSseEvent }
}

function emit(ref: React.MutableRefObject<((e: MessageEvent) => void) | null>, payload: object) {
  ref.current?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
}

describe('MessageList', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the empty-state placeholder when there are no messages', () => {
    renderML()
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })

  it('handles messages via ref', async () => {
    const { onSseEvent } = renderML()

    await act(async () => {
      emit(onSseEvent, { type: 'message', id: `${Date.now()}-0`, handle: 'alice', text: 'hello world', colorIndex: 1 })
    })

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('ignores typing events', async () => {
    const { onSseEvent } = renderML()

    await act(async () => {
      emit(onSseEvent, { type: 'typing', handle: 'alice' })
    })

    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })

  it('ignores presence events', async () => {
    const { onSseEvent } = renderML()

    await act(async () => {
      emit(onSseEvent, { type: 'presence', handles: [{ handle: 'alice', colorIndex: 0 }] })
    })

    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })

  it('backward compat (no type field)', async () => {
    const { onSseEvent } = renderML()

    await act(async () => {
      emit(onSseEvent, { id: `${Date.now()}-0`, handle: 'bob', text: 'hi there' })
    })

    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('hi there')).toBeInTheDocument()
  })

  it('renders multiple messages in order', async () => {
    const { onSseEvent } = renderML()
    const now = Date.now()

    await act(async () => {
      emit(onSseEvent, { type: 'message', id: `${now}-0`, handle: 'alice', text: 'first', colorIndex: 0 })
      emit(onSseEvent, { type: 'message', id: `${now + 1}-0`, handle: 'bob', text: 'second', colorIndex: 1 })
    })

    const messages = screen.getAllByRole('generic').filter(el =>
      el.textContent === 'first' || el.textContent === 'second',
    )
    expect(messages[0]).toHaveTextContent('first')
    expect(messages[1]).toHaveTextContent('second')
  })

  it('purges messages older than 5 minutes when the expiry interval fires', async () => {
    const oldTs = Date.now() - 6 * 60 * 1000
    const { onSseEvent } = renderML()

    await act(async () => {
      emit(onSseEvent, { type: 'message', id: `${oldTs}-0`, handle: 'alice', text: 'old message', colorIndex: 0 })
    })

    expect(screen.getByText('old message')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.queryByText('old message')).not.toBeInTheDocument()
    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })

  it('keeps messages younger than 5 minutes after the expiry interval fires', async () => {
    const recentTs = Date.now() - 2 * 60 * 1000
    const { onSseEvent } = renderML()

    await act(async () => {
      emit(onSseEvent, { type: 'message', id: `${recentTs}-0`, handle: 'bob', text: 'recent message', colorIndex: 1 })
    })

    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })

    expect(screen.getByText('recent message')).toBeInTheDocument()
  })
})
