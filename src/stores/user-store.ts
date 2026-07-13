import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserProfile, WatchlistItem, UserAlert, JournalEntry } from '@/types/user';
import { PortfolioPosition, PortfolioSnapshot } from '@/types/portfolio';
import { supabase } from '@/lib/supabase/client';

const ADMIN_USER_ID = 'admin_user';

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
  
  // Supabase Sync
  loadFromSupabase: () => Promise<void>;
  syncAlertToSupabase: (alert: UserAlert | { id: string, deleted: boolean }) => Promise<void>;
  syncJournalToSupabase: (journal: JournalEntry | { id: string, deleted: boolean }) => Promise<void>;
  syncPortfolioToSupabase: (position: PortfolioPosition | { id: string, deleted: boolean }) => Promise<void>;
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
      setTelegramChatId: (id) => {
        set({ telegramChatId: id });
        supabase.from('users').upsert({ id: ADMIN_USER_ID, telegram_chat_id: id }).then();
      },
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
      addAlert: (alert) => {
        set((state) => ({ alerts: [...state.alerts, alert] }));
        get().syncAlertToSupabase(alert);
      },
      removeAlert: (id) => {
        set((state) => ({ alerts: state.alerts.filter(a => a.id !== id) }));
        get().syncAlertToSupabase({ id, deleted: true });
      },
      toggleAlert: (id) => {
        set((state) => ({
          alerts: state.alerts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a),
        }));
        const updatedAlert = get().alerts.find(a => a.id === id);
        if (updatedAlert) get().syncAlertToSupabase(updatedAlert);
      },
      markAlertTriggered: (id) => {
        set((state) => ({
          alerts: state.alerts.map(a => a.id === id ? { 
            ...a, 
            isActive: false,
            isTriggered: true, 
            triggeredAt: new Date().toISOString(),
            triggerCount: a.triggerCount + 1
          } : a),
        }));
        const updatedAlert = get().alerts.find(a => a.id === id);
        if (updatedAlert) get().syncAlertToSupabase(updatedAlert);
      },
      addPosition: (position) => {
        set((state) => ({
          positions: [...state.positions, position],
        }));
        get().syncPortfolioToSupabase(position);
      },
      closePosition: (id, closedPrice) => {
        set((state) => ({
          positions: state.positions.map(p => p.id === id ? {
            ...p,
            isOpen: false,
            closedPrice,
            closedAt: new Date().toISOString(),
          } : p),
        }));
        const closedPos = get().positions.find(p => p.id === id);
        if (closedPos) get().syncPortfolioToSupabase(closedPos);
      },
      removePosition: (id) => {
        set((state) => ({
          positions: state.positions.filter(p => p.id !== id),
        }));
        get().syncPortfolioToSupabase({ id, deleted: true });
      },
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
      addJournal: (journal) => {
        set((state) => ({ journals: [journal, ...state.journals] }));
        get().syncJournalToSupabase(journal);
      },
      removeJournal: (id) => {
        set((state) => ({ journals: state.journals.filter(j => j.id !== id) }));
        get().syncJournalToSupabase({ id, deleted: true });
      },
      importData: (data) => set((state) => ({ ...state, ...data })),

      // Supabase Sync Implementations
      loadFromSupabase: async () => {
        try {
          const [alertsRes, journalsRes, portfoliosRes, userRes] = await Promise.all([
            supabase.from('alerts').select('*').eq('user_id', ADMIN_USER_ID),
            supabase.from('journals').select('*').eq('user_id', ADMIN_USER_ID).order('created_at', { ascending: false }),
            supabase.from('portfolios').select('*').eq('user_id', ADMIN_USER_ID),
            supabase.from('users').select('*').eq('id', ADMIN_USER_ID).single()
          ]);

          if (userRes.data) {
            set({ telegramChatId: userRes.data.telegram_chat_id });
          }

          if (alertsRes.data) {
            const mappedAlerts: UserAlert[] = alertsRes.data.map((a: any) => ({
              id: a.id,
              userId: a.user_id,
              symbol: a.symbol,
              marketType: a.market_type as any,
              alertType: a.alert_type as any,
              targetValue: a.target_value,
              targetSignal: null,
              isActive: a.is_active,
              isTriggered: a.is_triggered,
              triggeredAt: a.triggered_at,
              triggerCount: a.trigger_count,
              createdAt: a.created_at,
            }));
            set({ alerts: mappedAlerts });
          }

          if (journalsRes.data) {
            const mappedJournals: JournalEntry[] = journalsRes.data.map((j: any) => ({
              id: j.id,
              title: j.title,
              content: j.content,
              symbol: j.symbol || undefined,
              emotion: j.emotion as any,
              createdAt: j.created_at,
              updatedAt: j.updated_at,
            }));
            set({ journals: mappedJournals });
          }

          if (portfoliosRes.data) {
            const mappedPositions: PortfolioPosition[] = portfoliosRes.data.map((p: any) => ({
              id: p.id,
              symbol: p.symbol,
              marketType: p.market_type as any,
              entryPrice: p.entry_price,
              amount: p.amount,
              isOpen: p.is_open,
              currentPrice: p.entry_price, // Will be updated by realtime store
              createdAt: p.created_at,
            }));
            set({ positions: mappedPositions });
          }
        } catch (error) {
          console.error("Failed to load from Supabase:", error);
        }
      },

      syncAlertToSupabase: async (alert) => {
        try {
          if ('deleted' in alert) {
            await supabase.from('alerts').delete().eq('id', alert.id).eq('user_id', ADMIN_USER_ID);
          } else {
            const data = {
              id: alert.id,
              user_id: ADMIN_USER_ID,
              symbol: alert.symbol,
              market_type: alert.marketType,
              alert_type: alert.alertType,
              target_value: alert.targetValue,
              is_active: alert.isActive,
              is_triggered: alert.isTriggered,
              triggered_at: alert.triggeredAt,
              trigger_count: alert.triggerCount,
              created_at: alert.createdAt
            };
            await supabase.from('alerts').upsert(data);
          }
        } catch (e) { console.error("Sync alert failed", e); }
      },

      syncJournalToSupabase: async (journal) => {
        try {
          if ('deleted' in journal) {
            await supabase.from('journals').delete().eq('id', journal.id).eq('user_id', ADMIN_USER_ID);
          } else {
            const data = {
              id: journal.id,
              user_id: ADMIN_USER_ID,
              title: journal.title,
              content: journal.content,
              symbol: journal.symbol || null,
              emotion: journal.emotion,
              created_at: journal.createdAt,
              updated_at: journal.updatedAt
            };
            await supabase.from('journals').upsert(data);
          }
        } catch (e) { console.error("Sync journal failed", e); }
      },

      syncPortfolioToSupabase: async (position) => {
        try {
          if ('deleted' in position) {
            await supabase.from('portfolios').delete().eq('id', position.id).eq('user_id', ADMIN_USER_ID);
          } else {
            const data = {
              id: position.id,
              user_id: ADMIN_USER_ID,
              symbol: position.symbol,
              market_type: position.marketType,
              entry_price: position.entryPrice,
              amount: position.amount,
              is_open: position.isOpen,
              created_at: position.createdAt
            };
            await supabase.from('portfolios').upsert(data);
          }
        } catch (e) { console.error("Sync portfolio failed", e); }
      },
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
