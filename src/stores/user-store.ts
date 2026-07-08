import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserProfile, WatchlistItem, UserAlert } from '@/types/user';

interface UserState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  disclaimerAccepted: boolean;
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  watchlist: WatchlistItem[];
  alerts: UserAlert[];
  setUser: (user: UserProfile | null) => void;
  setAuthenticated: (isAuth: boolean) => void;
  acceptDisclaimer: () => void;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleSidebar: () => void;
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;
  addAlert: (alert: UserAlert) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      disclaimerAccepted: false,
      theme: 'dark',
      sidebarCollapsed: false,
      watchlist: [],
      alerts: [],
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthenticated: (isAuth) => set({ isAuthenticated: isAuth }),
      acceptDisclaimer: () => set({ disclaimerAccepted: true }),
      toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'dark' ? 'light' : 'dark';
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', newTheme === 'dark');
        }
        return { theme: newTheme };
      }),
      setTheme: (theme) => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', theme === 'dark');
        }
        set({ theme });
      },
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      addToWatchlist: (item) => set((state) => {
        if (state.watchlist.some(w => w.symbol === item.symbol)) return state;
        return { watchlist: [...state.watchlist, item] };
      }),
      removeFromWatchlist: (symbol) => set((state) => ({
        watchlist: state.watchlist.filter(w => w.symbol !== symbol),
      })),
      isInWatchlist: (symbol) => get().watchlist.some(w => w.symbol === symbol),
      addAlert: (alert) => set((state) => ({ alerts: [...state.alerts, alert] })),
      removeAlert: (id) => set((state) => ({ alerts: state.alerts.filter(a => a.id !== id) })),
      toggleAlert: (id) => set((state) => ({
        alerts: state.alerts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a),
      })),
    }),
    {
      name: 'user-store',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') return localStorage;
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      skipHydration: true,
    }
  )
);
