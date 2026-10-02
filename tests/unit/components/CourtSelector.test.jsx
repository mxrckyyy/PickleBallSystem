import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CourtSelector } from '../../../src/components/booking/CourtSelector.jsx';

const COURTS = [
  { id: 'c1', name: 'Court A', type: 'indoor' },
  { id: 'c2', name: 'Court B', type: 'outdoor' },
];

function renderSelector(props = {}) {
  const onSelect = vi.fn();
  const onRetry = vi.fn();
  render(
    <CourtSelector courts={COURTS} onSelect={onSelect} onRetry={onRetry} isConfigured {...props} />,
  );
  return { onSelect, onRetry };
}

describe('CourtSelector', () => {
  it('renders every court with its type', () => {
    renderSelector();
    expect(screen.getByRole('radio', { name: /court a/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /court b/i })).toBeInTheDocument();
    expect(screen.getByText('Indoor')).toBeInTheDocument();
    expect(screen.getByText('Outdoor')).toBeInTheDocument();
  });

  it('reports the clicked court', async () => {
    const { onSelect } = renderSelector();
    await userEvent.click(screen.getByRole('radio', { name: /court b/i }));
    expect(onSelect).toHaveBeenCalledWith(COURTS[1]);
  });

  it('marks the selected court with aria-checked', () => {
    renderSelector({ selectedId: 'c1' });
    expect(screen.getByRole('radio', { name: /court a/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /court b/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('shows a loading skeleton while fetching', () => {
    renderSelector({ loading: true, courts: [] });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the not-configured warning without credentials', () => {
    renderSelector({ isConfigured: false, courts: [] });
    expect(screen.getByText(/courts unavailable/i)).toBeInTheDocument();
  });

  it('shows an error with a retry action', async () => {
    const { onRetry } = renderSelector({
      courts: [],
      error: new Error('boom'),
    });
    expect(screen.getByText(/could not load courts/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when no courts exist', () => {
    renderSelector({ courts: [] });
    expect(screen.getByText(/no courts available/i)).toBeInTheDocument();
  });
});
