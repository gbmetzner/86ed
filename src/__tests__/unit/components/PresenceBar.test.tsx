import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import PresenceBar from '@/components/PresenceBar'

const entries = [
  { handle: 'alice', colorIndex: 0 },
  { handle: 'bob', colorIndex: 1 },
]

describe('PresenceBar', () => {
  it('renders all handles from entries prop', () => {
    render(<PresenceBar entries={entries} currentHandle="alice" />)
    expect(screen.getByText('alice (you)')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
  })

  it('labels the current user with (you)', () => {
    render(<PresenceBar entries={entries} currentHandle="bob" />)
    expect(screen.getByText('bob (you)')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('renders the online section header', () => {
    render(<PresenceBar entries={entries} currentHandle="alice" />)
    expect(screen.getByText('online')).toBeInTheDocument()
  })

  it('renders with empty entries', () => {
    render(<PresenceBar entries={[]} currentHandle="alice" />)
    expect(screen.getByText('online')).toBeInTheDocument()
    expect(screen.queryByText('alice')).not.toBeInTheDocument()
  })

  it('applies a color style to each entry', () => {
    const { container } = render(<PresenceBar entries={entries} currentHandle="alice" />)
    const spans = container.querySelectorAll('span[style]')
    expect(spans.length).toBeGreaterThan(0)
    spans.forEach(span => {
      expect((span as HTMLElement).style.color).toBeTruthy()
    })
  })
})
