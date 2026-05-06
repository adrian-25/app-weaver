import { create } from 'zustand';

interface AuthState {
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  showAuthModal: false,
  setShowAuthModal: (show) => set({ showAuthModal: show }),
}));