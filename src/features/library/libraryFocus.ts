import { create } from 'zustand';

/**
 * A temporary "show only these scores" view of the library, opened from elsewhere (e.g. the
 * library file check → "Show"). Cleared from the chip it shows above the list.
 */
type LibraryFocus = {
  focus: { ids: string[]; label: string } | null;
  show: (ids: string[], label: string) => void;
  clear: () => void;
};

export const useLibraryFocus = create<LibraryFocus>(set => ({
  focus: null,
  show: (ids, label) => set({ focus: { ids, label } }),
  clear: () => set({ focus: null }),
}));
