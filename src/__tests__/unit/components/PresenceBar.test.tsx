import { render, screen, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PresenceBar from '@/components/PresenceBar'

function mockFetchWith(handles: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ handles }),
  })
}

describe('PresenceBar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('renders nothing when the handles list is empty', async () => {
    vi.stubGlobal('fetch', mockFetchWith([]))
    const { container } = render(<PresenceBar roomId="room-1" currentHandle="alice" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('renders each handle in the room', async () => {
    vi.stubGlobal('fetch', mockFetchWith(['alice', 'bob']))
    render(<PresenceBar roomId="room-1" currentHandle="alice" />)
    expect(await screen.findByText('alice (you)')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('calls the correct presence API endpoint', async () => {
    const mockFetch = mockFetchWith([])
    vi.stubGlobal('fetch', mockFetch)
    render(<PresenceBar roomId="my-room-id" currentHandle="alice" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith('/api/presence/my-room-id')
  })

  it('polls the presence endpoint every 10 seconds', async () => {
    // Capture the interval callback instead of using fake timers,
    // to avoid the infinite-loop pitfall of runAllTimers on setInterval.
    const intervalCallbacks: Array<() => void> = []
    vi.spyOn(globalThis, 'setInterval').mockImplementation((fn) => {
      intervalCallbacks.push(fn as () => void)
      return 0 as unknown as ReturnType<typeof setInterval>
    })

    const mockFetch = mockFetchWith(['alice'])
    vi.stubGlobal('fetch', mockFetch)

    render(<PresenceBar roomId="room-1" currentHandle="alice" />)

    // Initial fetch runs immediately in the effect
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    // Simulate the interval firing
    await act(async () => { intervalCallbacks[0]?.() })

    expect(mockFetch).toHaveBeenCalledTimes(2)

    vi.restoreAllMocks()
  })

  it('stops polling after the component unmounts', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const mockFetch = mockFetchWith(['alice'])
    vi.stubGlobal('fetch', mockFetch)

    const { unmount } = render(<PresenceBar roomId="room-1" currentHandle="alice" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
