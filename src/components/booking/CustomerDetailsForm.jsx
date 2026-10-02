import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BOOKING_RULES } from '../../lib/constants.js';
import { isValidPHPhone, normalizePhone } from '../../lib/format.js';
import { Input } from '../ui/Input.jsx';

/**
 * Step 4 — customer details (spec §6 validation): name 2–100 chars,
 * phone 09XXXXXXXXX, optional valid email. Values sync into the booking
 * store on submit; the server re-validates on insert (§6).
 */
const detailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(
      BOOKING_RULES.minNameLength,
      `Name must be at least ${BOOKING_RULES.minNameLength} characters.`,
    )
    .max(
      BOOKING_RULES.maxNameLength,
      `Name must be at most ${BOOKING_RULES.maxNameLength} characters.`,
    ),
  phone: z
    .string()
    .trim()
    .min(1, 'Mobile number is required.')
    .refine((value) => isValidPHPhone(value), 'Enter a valid mobile number (09XXXXXXXXX).'),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Enter a valid email address.',
    ),
});

export function CustomerDetailsForm({ values, onSubmit }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      name: values?.name ?? '',
      phone: values?.phone ?? '',
      email: values?.email ?? '',
    },
  });

  useEffect(() => {
    reset({
      name: values?.name ?? '',
      phone: values?.phone ?? '',
      email: values?.email ?? '',
    });
  }, [values?.name, values?.phone, values?.email, reset]);

  return (
    <form
      noValidate
      onSubmit={handleSubmit((data) => {
        onSubmit?.({ ...data, phone: normalizePhone(data.phone) });
      })}
      className="space-y-4"
    >
      <Input
        label="Full name"
        required
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        label="Mobile number"
        required
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="09XXXXXXXXX"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input
        label="Email (optional)"
        type="email"
        autoComplete="email"
        hint="For your booking copy, if you want one."
        error={errors.email?.message}
        {...register('email')}
      />
      <button
        type="submit"
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
      >
        Save details
      </button>
    </form>
  );
}
