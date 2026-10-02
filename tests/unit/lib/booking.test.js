import { describe, expect, it } from 'vitest';
import {
  buildSlotStarts,
  estimateTotal,
  isSlotPast,
  slotEndFor,
  tierForStart,
} from '../../../src/lib/booking.js';

describe('buildSlotStarts', () => {
  it('covers 06:00 through 21:00 in one-hour steps (§6)', () => {
    const slots = buildSlotStarts();
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe('06:00');
    expect(slots.at(-1)).toBe('21:00');
  });
});

describe('slotEndFor', () => {
  it('ends every slot exactly one hour later', () => {
    expect(slotEndFor('06:00')).toBe('07:00');
    expect(slotEndFor('21:00')).toBe('22:00');
  });
});

describe('tierForStart', () => {
  it('maps start times onto the §6 pricing tiers', () => {
    expect(tierForStart('06:00').tier).toBe('off_peak');
    expect(tierForStart('11:59').tier).toBe('off_peak');
    expect(tierForStart('12:00').tier).toBe('standard');
    expect(tierForStart('17:59').tier).toBe('standard');
    expect(tierForStart('18:00').tier).toBe('peak');
    expect(tierForStart('21:00').tier).toBe('peak');
  });

  it('returns null outside operating hours or for bad input', () => {
    expect(tierForStart('05:00')).toBeNull();
    expect(tierForStart('22:00')).toBeNull();
    expect(tierForStart('')).toBeNull();
    expect(tierForStart(null)).toBeNull();
  });
});

describe('isSlotPast', () => {
  const now = new Date('2026-10-10T12:00:00');

  it('flags slots that already started', () => {
    expect(isSlotPast('2026-10-10', '11:00', now)).toBe(true);
    expect(isSlotPast('2026-10-09', '21:00', now)).toBe(true);
  });

  it('keeps today later slots and future dates bookable', () => {
    expect(isSlotPast('2026-10-10', '13:00', now)).toBe(false);
    expect(isSlotPast('2026-10-11', '06:00', now)).toBe(false);
  });

  it('never flags missing values', () => {
    expect(isSlotPast('', '')).toBe(false);
    expect(isSlotPast(null, null)).toBe(false);
    expect(isSlotPast('not-a-date', '99:99', now)).toBe(false);
  });
});

describe('estimateTotal', () => {
  it('adds the tier rate to priced add-on quantities', () => {
    const result = estimateTotal({
      startTime: '10:00',
      addons: [
        { id: 'a1', price: 100, quantity: 2 },
        { id: 'a2', price: 50, quantity: 1 },
      ],
    });
    expect(result.tier.tier).toBe('off_peak');
    expect(result.courtRate).toBe(200);
    expect(result.addonsTotal).toBe(250);
    expect(result.total).toBe(450);
  });

  it('uses the peak rate in the evening', () => {
    expect(estimateTotal({ startTime: '19:00' }).total).toBe(350);
  });

  it('still totals add-ons when no slot is chosen yet', () => {
    const result = estimateTotal({ addons: [{ id: 'a1', price: 100, quantity: 1 }] });
    expect(result.tier).toBeNull();
    expect(result.courtRate).toBe(0);
    expect(result.total).toBe(100);
  });

  it('defaults to zero with no inputs', () => {
    expect(estimateTotal().total).toBe(0);
  });
});
