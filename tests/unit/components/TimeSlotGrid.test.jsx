import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, format } from 'date-fns';
import { TimeSlotGrid } from '../../../src/components/booking/TimeSlotGrid.jsx';

const SLOTS = ['06:00', '07:00'];
const FUTURE_DATE = format(addDays(new Date(), 3), 'yyyy-MM-dd');

describe('TimeSlotGrid', () => {
  it('asks for a date before showing slots', () => {
    render(<TimeSlotGrid slots={SLOTS} bookingDate="" />);
    expect(screen.getByText(/pick a date first/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('renders one radio per slot with its time range', () => {
    render(<TimeSlotGrid slots={SLOTS} bookingDate={FUTURE_DATE} />);
    expect(screen.getByRole('radio', { name: /6:00 am – 7:00 am/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /7:00 am – 8:00 am/i })).toBeInTheDocument();
  });

  it('reports the selected start time', async () => {
    const onSelect = vi.fn();
    render(<TimeSlotGrid slots={SLOTS} bookingDate={FUTURE_DATE} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('radio', { name: /7:00 am – 8:00 am/i }));
    expect(onSelect).toHaveBeenCalledWith('07:00');
  });

  it('marks the active slot with aria-checked', () => {
    render(<TimeSlotGrid slots={SLOTS} bookingDate={FUTURE_DATE} selectedStart="06:00" />);
    expect(screen.getByRole('radio', { name: /6:00 am/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables every slot until a court is chosen', () => {
    render(<TimeSlotGrid slots={SLOTS} bookingDate={FUTURE_DATE} disabled />);
    expect(screen.getByRole('radio', { name: /6:00 am – 7:00 am/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /7:00 am – 8:00 am/i })).toBeDisabled();
  });
});
