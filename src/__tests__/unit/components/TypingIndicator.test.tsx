import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import TypingIndicator from '@/components/TypingIndicator'

describe('TypingIndicator', () => {
  it('renders nothing for empty handles', () => {
    const { container } = render(<TypingIndicator handles={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders "X is typing" for one handle', () => {
    render(<TypingIndicator handles={['alice']} />)
    expect(screen.getByText(/alice is typing/i)).toBeInTheDocument()
  })

  it('renders "X and Y are typing" for two handles', () => {
    render(<TypingIndicator handles={['alice', 'bob']} />)
    expect(screen.getByText(/alice and bob are typing/i)).toBeInTheDocument()
  })
})
