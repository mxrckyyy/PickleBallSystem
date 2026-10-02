import { addDays, format } from 'date-fns';
import { BOOKING_RULES, TIMEZONE_LABEL } from '../../lib/constants.js';
import { todayISODate } from '../../lib/format.js';
import { Input } from '../ui/Input.jsx';

/**
 * Step 2a — booking date (spec §6: today … +30 days, no past dates).
 * Stored as 'YYYY-MM-DD'; always rendered as Philippine wall-clock time (§19).
 */
export function DatePicker({ value = '', onChange, min, max }) {
  const minDate = min ?? todayISODate();
  const maxDate = max ?? format(addDays(new Date(), BOOKING_RULES.maxAdvanceDays), 'yyyy-MM-dd');

  return (
    <Input
      type="date"
      label="Booking date"
      required
      value={value}
      min={minDate}
      max={maxDate}
      onChange={(event) => onChange?.(event.target.value)}
      hint={`Choose a day between today and ${BOOKING_RULES.maxAdvanceDays} days ahead · ${TIMEZONE_LABEL}`}
    />
  );
}
