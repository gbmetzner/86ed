import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MessageInput from '@/components/MessageInput'

describe('MessageInput', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the textarea with a placeholder', () => {
    render(<MessageInput roomId="room-1" sessionId="sess-1" handle="alice" />)
    expect(screen.getByPlaceholderText('say something...')).toBeInTheDocument()
  })

  it('sends the message on Enter and clears the input', async () => {
    const user = userEvent.setup()
    render(<MessageInput roomId="room-1" sessionId="sess-1" handle="alice" />)

    const textarea = screen.getByPlaceholderText('say something...')
    await user.type(textarea, 'hello{Enter}')

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/messages/room-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ handle: 'alice', text: 'hello', sessionId: 'sess-1' }),
      }),
    )
    expect(textarea).toHaveValue('')
  })

  it('does not send on Shift+Enter', async () => {
    const user = userEvent.setup()
    render(<MessageInput roomId="room-1" sessionId="sess-1" handle="alice" />)

    const textarea = screen.getByPlaceholderText('say something...')
    await user.type(textarea, 'hello{Shift>}{Enter}{/Shift}')

    // Shift+Enter inserts a newline but does NOT send the message
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/messages/room-1', expect.anything())
    expect(textarea).toHaveValue('hello\n')
  })

  it('does not send a blank or whitespace-only message', async () => {
    const user = userEvent.setup()
    render(<MessageInput roomId="room-1" sessionId="sess-1" handle="alice" />)

    const textarea = screen.getByPlaceholderText('say something...')
    await user.type(textarea, '   {Enter}')

    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/messages/room-1', expect.anything())
  })

  it('trims the message text before sending', async () => {
    const user = userEvent.setup()
    render(<MessageInput roomId="room-1" sessionId="sess-1" handle="alice" />)

    const textarea = screen.getByPlaceholderText('say something...')
    await user.type(textarea, '  trimmed  {Enter}')

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/messages/room-1',
      expect.objectContaining({
        body: JSON.stringify({ handle: 'alice', text: 'trimmed', sessionId: 'sess-1' }),
      }),
    )
  })
})
