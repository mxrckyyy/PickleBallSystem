import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerDetailsForm } from '../../../src/components/booking/CustomerDetailsForm.jsx';

describe('CustomerDetailsForm', () => {
  it('pre-fills the saved details', () => {
    render(
      <CustomerDetailsForm
        values={{ name: 'Juan Dela Cruz', phone: '09171234567', email: '' }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Juan Dela Cruz');
    expect(screen.getByLabelText(/mobile number/i)).toHaveValue('09171234567');
  });

  it('rejects invalid name and phone without submitting (§6)', async () => {
    const onSubmit = vi.fn();
    render(<CustomerDetailsForm values={{}} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'A');
    await userEvent.type(screen.getByLabelText(/mobile number/i), '123');
    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/09xxxxxxxxx/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with the phone normalised to storage format', async () => {
    const onSubmit = vi.fn();
    render(<CustomerDetailsForm values={{}} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Juan Dela Cruz');
    await userEvent.type(screen.getByLabelText(/mobile number/i), '0917 123 4567');
    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Juan Dela Cruz',
      phone: '09171234567',
      email: '',
    });
  });

  it('accepts an empty email but rejects a malformed one', async () => {
    const onSubmit = vi.fn();
    render(<CustomerDetailsForm values={{}} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Maria Clara');
    await userEvent.type(screen.getByLabelText(/mobile number/i), '09171234567');
    await userEvent.type(screen.getByLabelText(/email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /save details/i }));
    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText(/email/i));
    await userEvent.click(screen.getByRole('button', { name: /save details/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
