import { create } from 'zustand';

export type SnackbarSpec = {
  id: number;
  message: string;
  /** e.g. { label: t('common.undo'), onPress: restore } */
  action?: { label: string; onPress: () => void };
  /** ms. Defaults: 4000 without action, 6000 with (time to reach Undo). */
  duration?: number;
  onDismiss?: () => void;
};

export type ToastSpec = { id: number; message: string; icon?: import('@/ui/icons').IconName; duration?: number };

type FeedbackState = {
  snackbar: SnackbarSpec | null;
  toast: ToastSpec | null;
  /** Height of bottom UI (nav bar, toolbars) the snackbar must sit above. */
  bottomObstruction: number;
  showSnackbar: (spec: Omit<SnackbarSpec, 'id'>) => void;
  dismissSnackbar: (id: number) => void;
  showToast: (spec: Omit<ToastSpec, 'id'>) => void;
  dismissToast: (id: number) => void;
  setBottomObstruction: (h: number) => void;
};

let nextId = 1;

export const useFeedback = create<FeedbackState>((set, get) => ({
  snackbar: null,
  toast: null,
  bottomObstruction: 0,
  showSnackbar: spec => {
    // A new snackbar replaces the current one; the old one's onDismiss still fires
    // (e.g. to finalise a delete that can no longer be undone).
    get().snackbar?.onDismiss?.();
    set({ snackbar: { ...spec, id: nextId++ } });
  },
  dismissSnackbar: id => {
    const current = get().snackbar;
    if (current?.id !== id) return;
    current.onDismiss?.();
    set({ snackbar: null });
  },
  showToast: spec => set({ toast: { ...spec, id: nextId++ } }),
  dismissToast: id => {
    if (get().toast?.id === id) set({ toast: null });
  },
  setBottomObstruction: h => set({ bottomObstruction: h }),
}));

export const showSnackbar = (spec: Omit<SnackbarSpec, 'id'>) => useFeedback.getState().showSnackbar(spec);
export const showToast = (spec: Omit<ToastSpec, 'id'>) => useFeedback.getState().showToast(spec);
