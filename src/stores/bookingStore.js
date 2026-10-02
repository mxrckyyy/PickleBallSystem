import { create } from 'zustand';

/**
 * Client-side booking flow state (spec §1: "Zustand — Lightweight store for
 * booking flow").
 *
 * This store only holds the customer's in-progress selection so the Book page
 * survives route changes. It is NEVER a source of truth for availability,
 * price or booking status — those come from the database.
 */
const INITIAL_STATE = {
  courtId: null,
  courtName: null,
  bookingDate: null,
  startTime: null,
  endTime: null,
  addons: [],
  customer: { name: '', phone: '', email: '' },
};

export const useBookingStore = create((set) => ({
  ...INITIAL_STATE,

  setCourt: (courtId, courtName) => set({ courtId, courtName, startTime: null, endTime: null }),

  setBookingDate: (bookingDate) => set({ bookingDate, startTime: null, endTime: null }),

  setSlot: ({ startTime, endTime }) => set({ startTime, endTime }),

  clearSlot: () => set({ startTime: null, endTime: null }),

  setCustomer: (patch) => set((state) => ({ customer: { ...state.customer, ...patch } })),

  toggleAddon: (addon) =>
    set((state) => {
      const exists = state.addons.some((item) => item.id === addon.id);
      return {
        addons: exists
          ? state.addons.filter((item) => item.id !== addon.id)
          : [...state.addons, { ...addon, quantity: 1 }],
      };
    }),

  setAddonQuantity: (addonId, quantity) =>
    set((state) => ({
      addons: state.addons
        .map((item) => (item.id === addonId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
    })),

  reset: () => set(INITIAL_STATE),
}));
