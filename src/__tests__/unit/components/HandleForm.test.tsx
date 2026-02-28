import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import HandleForm from '@/components/HandleForm'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('HandleForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    mockPush.mockReset()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the handle input and submit button', () => {
    render(<HandleForm />)
    expect(screen.getByPlaceholderText('your handle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'enter' })).toBeInTheDocument()
  })

  it('disables the submit button when the handle is empty', () => {
    render(<HandleForm />)
    expect(screen.getByRole('button', { name: 'enter' })).toBeDisabled()
  })

  it('enables the submit button once a handle is typed', async () => {
    const user = userEvent.setup()
    render(<HandleForm />)
    await user.type(screen.getByPlaceholderText('your handle'), 'alice')
    expect(screen.getByRole('button', { name: 'enter' })).toBeEnabled()
  })

  it('calls /api/join, stores session, and redirects on success', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ roomId: 'room-abc', sessionId: 'sess-xyz' }),
    } as Response)

    render(<HandleForm />)
    await user.type(screen.getByPlaceholderText('your handle'), 'alice')
    await user.click(screen.getByRole('button', { name: 'enter' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/join',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ handle: 'alice' }),
        }),
      )
      expect(sessionStorage.getItem('sessionId')).toBe('sess-xyz')
      expect(sessionStorage.getItem('handle')).toBe('alice')
      expect(sessionStorage.getItem('roomId')).toBe('room-abc')
      expect(mockPush).toHaveBeenCalledWith('/snug/room-abc')
    })
  })

  it('trims whitespace from the handle before submitting', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ roomId: 'room-abc', sessionId: 'sess-xyz' }),
    } as Response)

    render(<HandleForm />)
    await user.type(screen.getByPlaceholderText('your handle'), '  alice  ')
    await user.click(screen.getByRole('button', { name: 'enter' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/join',
        expect.objectContaining({ body: JSON.stringify({ handle: 'alice' }) }),
      )
    })
  })

  it('shows an error message when the API returns a non-ok response', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)

    render(<HandleForm />)
    await user.type(screen.getByPlaceholderText('your handle'), 'alice')
    await user.click(screen.getByRole('button', { name: 'enter' }))

    await waitFor(() => {
      expect(screen.getByText(/failed to join/i)).toBeInTheDocument()
    })
  })

  it('shows a connection error message on network failure', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    render(<HandleForm />)
    await user.type(screen.getByPlaceholderText('your handle'), 'alice')
    await user.click(screen.getByRole('button', { name: 'enter' }))

    await waitFor(() => {
      expect(screen.getByText(/connection error/i)).toBeInTheDocument()
    })
  })

  it('shows "joining..." while the request is in-flight', async () => {
    const user = userEvent.setup()
    // Never-resolving promise so the loading state is visible
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    render(<HandleForm />)
    await user.type(screen.getByPlaceholderText('your handle'), 'alice')
    await user.click(screen.getByRole('button'))

    expect(await screen.findByRole('button', { name: 'joining...' })).toBeInTheDocument()
  })
})
