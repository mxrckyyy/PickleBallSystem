import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../../src/components/ui/Button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Book court</Button>);
    expect(screen.getByRole('button', { name: 'Book court' })).toBeInTheDocument();
  });

  it('shows a loading state and blocks interaction', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Pay now
      </Button>,
    );

    const button = screen.getByRole('button', { name: /pay now/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
