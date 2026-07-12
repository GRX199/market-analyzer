import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserProfile, WatchlistItem, UserAlert, JournalEntry } from '@/types/user';
import { PortfolioPosition, PortfolioSnapshot } from '@/types/portfolio';

interface UserState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  disclaimerAccepted: boolean;
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  watchlist: WatchlistItem[];
  alerts: UserAlert[];
  telegramChatId: string | null;
  positions: PortfolioPosition[];
  portfolioHistory: PortfolioSnapshot[];
  journals: JournalEntry[];
  setUser: (user: UserProfile | null) => void;
  setAuthenticated: (isAuth: boolean) => void;
  acceptDisclaimer: () => void;
  setTelegramChatId: (id: string | null) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleSidebar: () => void;
  addToWatchlist: (item: WatchlistItem) => void;
  removeFromWatchlist: (symbol: string) => void;
  isInWatchlist: (symbol: string) => boolean;
  addAlert: (alert: UserAlert) => void;
  removeAlert: (id: string) => void;
  toggleAlert: (id: string) => void;
  markAlertTriggered: (id: string) => void;
  addPosition: (position: PortfolioPosition) => void;
  closePosition: (id: string, closedPrice: number) => void;
  removePosition: (id: string) => void;
  updatePositionPrice: (symbol: string, price: number) => void;
  snapshotPortfolio: (totalValue: number, totalPnl: number, totalPnlPercent: number) => void;
  addJournal: (journal: JournalEntry) => void;
  removeJournal: (id: string) => void;
  importData: (data: Partial<UserState>) => void;
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
      telegramChatId: null,
      positions: [],
      portfolioHistory: [],
      journals: [],
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthenticated: (isAuth) => set({ isAuthenticated: isAuth }),
      acceptDisclaimer: () => set({ disclaimerAccepted: true }),
      setTelegramChatId: (id) => set({ telegramChatId: id }),
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
      markAlertTriggered: (id) => set((state) => ({
        alerts: state.alerts.map(a => a.id === id ? { 
          ...a, 
          isActive: false,
          isTriggered: true, 
          triggeredAt: new Date().toISOString(),
          triggerCount: a.triggerCount + 1
        } : a),
      })),
      addPosition: (position) => set((state) => ({
        positions: [...state.positions, position],
      })),
      closePosition: (id, closedPrice) => set((state) => ({
        positions: state.positions.map(p => p.id === id ? {
          ...p,
          isOpen: false,
          closedPrice,
          closedAt: new Date().toISOString(),
        } : p),
      })),
      removePosition: (id) => set((state) => ({
        positions: state.positions.filter(p => p.id !== id),
      })),
      updatePositionPrice: (symbol, price) => set((state) => ({
        positions: state.positions.map(p => p.symbol === symbol ? { ...p, currentPrice: price } : p),
      })),
      snapshotPortfolio: (totalValue, totalPnl, totalPnlPercent) => set((state) => {
        const today = new Date().toISOString().split('T')[0];
        const openCount = state.positions.filter(p => p.isOpen).length;
        // Replace today's snapshot if it exists, otherwise add new
        const existing = state.portfolioHistory.findIndex(s => s.date === today);
        const snapshot: PortfolioSnapshot = {
          date: today,
          totalValue,
          totalPnl,
          totalPnlPercent,
          positionCount: openCount,
        };
        if (existing >= 0) {
          const updated = [...state.portfolioHistory];
          updated[existing] = snapshot;
          return { portfolioHistory: updated };
        }
        return { portfolioHistory: [...state.portfolioHistory, snapshot].slice(-90) }; // Keep 90 days max
      }),
      addJournal: (journal) => set((state) => ({ journals: [journal, ...state.journals] })),
      removeJournal: (id) => set((state) => ({ journals: state.journals.filter(j => j.id !== id) })),
      importData: (data) => set((state) => ({ ...state, ...data })),
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
