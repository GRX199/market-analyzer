import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserProfile, WatchlistItem, UserAlert, JournalEntry } from '@/types/user';
import { PortfolioPosition, PortfolioSnapshot } from '@/types/portfolio';
import { MarketType } from '@/types/market';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'sonner';

type DatabaseRow = Record<string, unknown>;

const MARKET_TYPES: MarketType[] = ['forex', 'stocks', 'crypto'];
const ALERT_TYPES: UserAlert['alertType'][] = [
  'price_above',
  'price_below',
  'score_above',
  'score_below',
  'signal_change',
  'trend_change',
];
const EMOTIONS: JournalEntry['emotion'][] = [
  'confident',
  'fearful',
  'greedy',
  'neutral',
  'frustrated',
];
const TRADE_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._#-]{1,31}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/;
let accountLoadSequence = 0;

export interface CreateAutoTradeInput {
  symbol: string;
  marketType: MarketType;
  action: 'buy' | 'sell';
  volume: number;
  idempotencyKey: string;
}

export interface AutoTradeReceipt {
  id: string;
  status: string;
  duplicate: boolean;
}

function asRow(value: unknown): DatabaseRow {
  return typeof value === 'object' && value !== null
    ? value as DatabaseRow
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asMarketType(value: unknown): MarketType {
  return MARKET_TYPES.includes(value as MarketType) ? value as MarketType : 'crypto';
}

function asAlertType(value: unknown): UserAlert['alertType'] {
  return ALERT_TYPES.includes(value as UserAlert['alertType'])
    ? value as UserAlert['alertType']
    : 'price_above';
}

function asEmotion(value: unknown): JournalEntry['emotion'] {
  return EMOTIONS.includes(value as JournalEntry['emotion'])
    ? value as JournalEntry['emotion']
    : 'neutral';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const row = asRow(error);
  return asString(row.message, 'Terjadi kesalahan yang tidak diketahui.');
}

function throwIfError(error: unknown, context: string): void {
  if (!error) return;
  throw new Error(`${context}: ${getErrorMessage(error)}`);
}

function reportSyncFailure(label: string, error: unknown): void {
  const message = getErrorMessage(error);
  console.error(`${label}:`, error);
  if (typeof window !== 'undefined') {
    toast.error(label, { description: message });
  }
}

interface UserState {
  user: UserProfile | null;
  authenticatedUserId: string | null;
  isAuthenticated: boolean;
  disclaimerAccepted: boolean;
  disclaimerAcceptedUserId: string | null;
  isAccountLoading: boolean;
  accountLoadError: string | null;
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
  // Alert persistence is owned by the server-side atomic trigger endpoint.
  // This only mirrors a confirmed server result in client state.
  markAlertTriggered: (
    id: string,
    triggeredAt?: string | null,
    triggerCount?: number,
  ) => void;
  addPosition: (position: PortfolioPosition) => void;
  closePosition: (id: string, closedPrice: number) => void;
  removePosition: (id: string) => void;
  updatePositionPrice: (symbol: string, price: number) => void;
  snapshotPortfolio: (totalValue: number, totalPnl: number, totalPnlPercent: number) => void;
  addJournal: (journal: JournalEntry) => void;
  removeJournal: (id: string) => void;
  importData: (data: unknown) => void;
  
  // Supabase Sync
  loadFromSupabase: () => Promise<void>;
  createAutoTrade: (input: CreateAutoTradeInput) => Promise<AutoTradeReceipt>;
  syncAlertToSupabase: (alert: UserAlert | { id: string, deleted: boolean }) => Promise<void>;
  syncJournalToSupabase: (journal: JournalEntry | { id: string, deleted: boolean }) => Promise<void>;
  syncPortfolioToSupabase: (position: PortfolioPosition | { id: string, deleted: boolean }) => Promise<void>;
  syncWatchlistToSupabase: (item: WatchlistItem | { id: string, deleted: boolean }) => Promise<void>;
  logout: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: null,
      authenticatedUserId: null,
      isAuthenticated: false,
      disclaimerAccepted: false,
      disclaimerAcceptedUserId: null,
      isAccountLoading: true,
      accountLoadError: null,
      theme: 'dark',
      sidebarCollapsed: false,
      watchlist: [],
      alerts: [],
      telegramChatId: null,
      positions: [],
      portfolioHistory: [],
      journals: [],
      setUser: (user) => set({ user }),
      setAuthenticated: (isAuth) => set((state) => ({
        isAuthenticated: isAuth,
        authenticatedUserId: isAuth ? state.authenticatedUserId : null,
        ...(!isAuth
          ? {
              disclaimerAccepted: false,
              disclaimerAcceptedUserId: null,
            }
          : {}),
      })),
      acceptDisclaimer: () => {
        const userId = get().authenticatedUserId;
        if (!userId) {
          reportSyncFailure(
            'Disclaimer belum dapat diterima',
            new Error('Tunggu autentikasi akun selesai.'),
          );
          return;
        }
        const acceptedAt = new Date().toISOString();
        set((state) => ({
          disclaimerAccepted: true,
          disclaimerAcceptedUserId: userId,
          user: state.user?.id === userId
            ? {
                ...state.user,
                disclaimerAccepted: true,
                disclaimerAcceptedAt: acceptedAt,
                updatedAt: acceptedAt,
              }
            : state.user,
        }));
      },
      setTelegramChatId: async (id) => {
        const previousId = get().telegramChatId;
        set({ telegramChatId: id });

        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          throwIfError(authError, 'Autentikasi gagal');
          if (!user) return;

          const { error } = await supabase
            .from('users')
            .upsert({ id: user.id, telegram_chat_id: id });
          throwIfError(error, 'Telegram Chat ID gagal disimpan');
        } catch (error) {
          set({ telegramChatId: previousId });
          reportSyncFailure('Telegram Chat ID gagal disimpan', error);
        }
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
      addToWatchlist: (item) => {
        set((state) => {
          if (state.watchlist.some(w => w.symbol === item.symbol)) return state;
          return { watchlist: [...state.watchlist, item] };
        });
        void get().syncWatchlistToSupabase(item);
      },
      removeFromWatchlist: (symbol) => {
        const item = get().watchlist.find(w => w.symbol === symbol);
        if (item) {
          set((state) => ({ watchlist: state.watchlist.filter(w => w.symbol !== symbol) }));
          void get().syncWatchlistToSupabase({ id: item.id, deleted: true });
        }
      },
      isInWatchlist: (symbol) => get().watchlist.some(w => w.symbol === symbol),
      addAlert: (alert) => {
        set((state) => ({ alerts: [...state.alerts, alert] }));
        void get().syncAlertToSupabase(alert);
      },
      removeAlert: (id) => {
        set((state) => ({ alerts: state.alerts.filter(a => a.id !== id) }));
        void get().syncAlertToSupabase({ id, deleted: true });
      },
      toggleAlert: (id) => {
        set((state) => ({
          alerts: state.alerts.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a),
        }));
        const updatedAlert = get().alerts.find(a => a.id === id);
        if (updatedAlert) void get().syncAlertToSupabase(updatedAlert);
      },
      markAlertTriggered: (id, triggeredAt, triggerCount) => {
        set((state) => ({
          alerts: state.alerts.map(a => a.id === id ? { 
            ...a, 
            isActive: false,
            isTriggered: true, 
            triggeredAt: triggeredAt ?? new Date().toISOString(),
            triggerCount: typeof triggerCount === 'number' && Number.isInteger(triggerCount)
              ? triggerCount
              : a.triggerCount + 1,
          } : a),
        }));
      },
      addPosition: (position) => {
        set((state) => ({
          positions: [...state.positions, position],
        }));
        void get().syncPortfolioToSupabase(position);
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
        if (closedPos) void get().syncPortfolioToSupabase(closedPos);
      },
      removePosition: (id) => {
        set((state) => ({
          positions: state.positions.filter(p => p.id !== id),
        }));
        void get().syncPortfolioToSupabase({ id, deleted: true });
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
        void get().syncJournalToSupabase(journal);
      },
      removeJournal: (id) => {
        set((state) => ({ journals: state.journals.filter(j => j.id !== id) }));
        void get().syncJournalToSupabase({ id, deleted: true });
      },
      importData: (data) => {
        const backup = asRow(data);
        const backupState = asRow(backup.state);
        const currentUserId = get().authenticatedUserId;
        if (!currentUserId || asString(backup.ownerUserId) !== currentUserId) {
          throw new Error('Backup tidak dimiliki oleh akun yang sedang terverifikasi.');
        }
        if (backup.version !== 1) {
          throw new Error('Versi backup lokal tidak didukung.');
        }

        const portfolioHistory = Array.isArray(backupState.portfolioHistory)
          ? backupState.portfolioHistory.flatMap((value): PortfolioSnapshot[] => {
              const row = asRow(value);
              const date = asString(row.date);
              const totalValue = asNumber(row.totalValue, Number.NaN);
              const totalPnl = asNumber(row.totalPnl, Number.NaN);
              const totalPnlPercent = asNumber(row.totalPnlPercent, Number.NaN);
              const positionCount = asNumber(row.positionCount, Number.NaN);
              if (
                !/^\d{4}-\d{2}-\d{2}$/.test(date)
                || !Number.isFinite(totalValue)
                || !Number.isFinite(totalPnl)
                || !Number.isFinite(totalPnlPercent)
                || !Number.isInteger(positionCount)
                || positionCount < 0
              ) {
                return [];
              }
              return [{
                date,
                totalValue,
                totalPnl,
                totalPnlPercent,
                positionCount,
              }];
            }).slice(-90)
          : [];

        set({
          theme: backupState.theme === 'light' ? 'light' : 'dark',
          sidebarCollapsed: backupState.sidebarCollapsed === true,
          portfolioHistory,
        });
      },

      // Supabase Sync Implementations
      loadFromSupabase: async () => {
        const loadSequence = accountLoadSequence + 1;
        accountLoadSequence = loadSequence;
        set({
          isAccountLoading: true,
          accountLoadError: null,
        });

        try {
          // A missing browser session is a normal signed-out state, not an
          // application error. Use the locally stored session only as a
          // presence check, then still verify the user with getUser() before
          // trusting any account identity or loading owner-bound data.
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();
          throwIfError(sessionError, 'Sesi lokal gagal dibaca');
          if (loadSequence !== accountLoadSequence) return;

          if (!session) {
            set({
              user: null,
              authenticatedUserId: null,
              isAuthenticated: false,
              disclaimerAccepted: false,
              disclaimerAcceptedUserId: null,
              isAccountLoading: false,
              accountLoadError: null,
              watchlist: [],
              alerts: [],
              positions: [],
              portfolioHistory: [],
              journals: [],
              telegramChatId: null,
            });
            return;
          }

          const { data: { user }, error: authError } = await supabase.auth.getUser();
          throwIfError(authError, 'Autentikasi gagal');
          if (loadSequence !== accountLoadSequence) return;

          if (!user) {
            set({
              user: null,
              authenticatedUserId: null,
              isAuthenticated: false,
              disclaimerAccepted: false,
              disclaimerAcceptedUserId: null,
              isAccountLoading: false,
              accountLoadError: null,
              watchlist: [],
              alerts: [],
              positions: [],
              portfolioHistory: [],
              journals: [],
              telegramChatId: null,
            });
            return;
          }

          const userId = user.id;
          const stateBeforeLoad = get();
          const previousAccountId = stateBeforeLoad.authenticatedUserId;
          const isSameAccount = previousAccountId === userId;
          const cachedUser = stateBeforeLoad.user?.id === userId
            ? stateBeforeLoad.user
            : null;
          if (!isSameAccount) {
            set((state) => ({
              user: null,
              authenticatedUserId: null,
              isAuthenticated: false,
              disclaimerAccepted:
                state.disclaimerAcceptedUserId === userId
                && state.disclaimerAccepted,
              disclaimerAcceptedUserId:
                state.disclaimerAcceptedUserId === userId ? userId : null,
              watchlist: [],
              alerts: [],
              positions: [],
              portfolioHistory: [],
              journals: [],
              telegramChatId: null,
            }));
          }

          const [alertsRes, journalsRes, portfoliosRes, watchlistsRes, userRes] = await Promise.all([
            supabase.from('alerts').select('*').eq('user_id', userId),
            supabase.from('journals').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
            supabase.from('portfolios').select('*').eq('user_id', userId),
            supabase.from('watchlists').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
            supabase.from('users').select('*').eq('id', userId).maybeSingle()
          ]);

          const loadErrors = [
            alertsRes.error,
            journalsRes.error,
            portfoliosRes.error,
            watchlistsRes.error,
            userRes.error,
          ].filter(Boolean);

          if (loadErrors.length > 0) {
            throw new Error(loadErrors.map(getErrorMessage).join(' | '));
          }
          if (loadSequence !== accountLoadSequence) return;

          // Auto-heal missing profile
          let telegramChatId: string | null = null;
          let profileRow: DatabaseRow = {};
          if (!userRes.data) {
            const { error } = await supabase.from('users').upsert({ id: userId });
            throwIfError(error, 'Profil pengguna gagal dibuat');
          } else {
            profileRow = asRow(userRes.data);
            telegramChatId = asNullableString(profileRow.telegram_chat_id);
          }

          const mappedWatchlists: WatchlistItem[] = (watchlistsRes.data ?? []).map((value) => {
            const row = asRow(value);
            const symbol = asString(row.symbol);
            return {
              id: asString(row.id),
              userId: asString(row.user_id, userId),
              symbol,
              marketType: asMarketType(row.market_type),
              displayName: asString(row.display_name, symbol),
              notes: asNullableString(row.notes),
              sortOrder: asNumber(row.sort_order),
              timeframe: asString(row.timeframe, '1H'),
              lastSignal: asNullableString(row.last_signal),
              createdAt: asString(row.created_at, new Date().toISOString()),
            };
          });

          const mappedAlerts: UserAlert[] = (alertsRes.data ?? []).map((value) => {
            const row = asRow(value);
            return {
              id: asString(row.id),
              userId: asString(row.user_id, userId),
              symbol: asString(row.symbol),
              marketType: asMarketType(row.market_type),
              alertType: asAlertType(row.alert_type),
              targetValue: row.target_value === null
                ? null
                : asNumber(row.target_value),
              targetSignal: asNullableString(row.target_signal),
              timeframe: asNullableString(row.timeframe),
              isActive: asBoolean(row.is_active, true),
              isTriggered: asBoolean(row.is_triggered, false),
              triggeredAt: asNullableString(row.triggered_at),
              triggerCount: asNumber(row.trigger_count),
              createdAt: asString(row.created_at, new Date().toISOString()),
            };
          });

          const mappedJournals: JournalEntry[] = (journalsRes.data ?? []).map((value) => {
            const row = asRow(value);
            const symbol = asNullableString(row.symbol);
            return {
              id: asString(row.id),
              title: asString(row.title),
              content: asString(row.content),
              symbol: symbol ?? undefined,
              emotion: asEmotion(row.emotion),
              createdAt: asString(row.created_at, new Date().toISOString()),
              updatedAt: asString(row.updated_at, new Date().toISOString()),
            };
          });

          const localPositions = new Map(
            (isSameAccount ? get().positions : [])
              .map(position => [position.id, position]),
          );
          const mappedPositions: PortfolioPosition[] = (portfoliosRes.data ?? []).map((value) => {
            const row = asRow(value);
            const id = asString(row.id);
            const localPosition = localPositions.get(id);
            const symbol = asString(row.symbol, localPosition?.symbol);
            const entryPrice = asNumber(row.entry_price, localPosition?.entryPrice ?? 0);
            const closedPrice = asOptionalNumber(row.closed_price);
            const isOpen = asBoolean(row.is_open, true);

            return {
              id,
              symbol,
              name: asString(row.name, localPosition?.name ?? symbol),
              marketType: asMarketType(row.market_type),
              type: row.type === 'sell'
                ? 'sell'
                : row.type === 'buy'
                  ? 'buy'
                  : localPosition?.type ?? 'buy',
              quantity: asNumber(row.amount, localPosition?.quantity ?? 0),
              entryPrice,
              currentPrice: localPosition?.currentPrice
                ?? (isOpen ? entryPrice : closedPrice ?? entryPrice),
              isOpen,
              closedPrice,
              closedAt: asNullableString(row.closed_at) ?? undefined,
              notes: localPosition?.notes,
              createdAt: asString(
                row.created_at,
                localPosition?.createdAt ?? new Date().toISOString(),
              ),
            };
          });

          const {
            data: { user: verifiedUser },
            error: verificationError,
          } = await supabase.auth.getUser();
          throwIfError(verificationError, 'Verifikasi sesi gagal');
          if (
            loadSequence !== accountLoadSequence
            || verifiedUser?.id !== userId
          ) {
            return;
          }

          const metadata = asRow(verifiedUser.user_metadata);
          const now = new Date().toISOString();
          const acceptedForThisAccount =
            get().disclaimerAcceptedUserId === userId
            && get().disclaimerAccepted;
          const metadataDisplayName = asNullableString(metadata.display_name)
            ?? asNullableString(metadata.full_name)
            ?? asNullableString(metadata.name);
          const metadataPreferredMarket = asString(metadata.preferred_market);
          const profile: UserProfile = {
            id: userId,
            email: asString(verifiedUser.email, cachedUser?.email ?? ''),
            username: asNullableString(metadata.username) ?? cachedUser?.username ?? null,
            displayName: metadataDisplayName ?? cachedUser?.displayName ?? null,
            avatarUrl:
              asNullableString(metadata.avatar_url)
              ?? asNullableString(metadata.picture)
              ?? cachedUser?.avatarUrl
              ?? null,
            preferredMarket: MARKET_TYPES.includes(metadataPreferredMarket as MarketType)
              ? metadataPreferredMarket as MarketType
              : cachedUser?.preferredMarket ?? 'crypto',
            theme: get().theme,
            disclaimerAccepted: acceptedForThisAccount,
            disclaimerAcceptedAt: acceptedForThisAccount
              ? cachedUser?.disclaimerAcceptedAt ?? now
              : null,
            createdAt: asString(
              profileRow.created_at,
              cachedUser?.createdAt ?? verifiedUser.created_at ?? now,
            ),
            updatedAt: asString(profileRow.updated_at, cachedUser?.updatedAt ?? now),
          };

          set((state) => ({
            authenticatedUserId: userId,
            isAuthenticated: true,
            user: profile,
            disclaimerAccepted:
              state.disclaimerAcceptedUserId === userId
              && state.disclaimerAccepted,
            disclaimerAcceptedUserId:
              state.disclaimerAcceptedUserId === userId ? userId : null,
            isAccountLoading: false,
            accountLoadError: null,
            telegramChatId,
            watchlist: mappedWatchlists,
            alerts: mappedAlerts,
            journals: mappedJournals,
            positions: mappedPositions,
          }));
        } catch (error) {
          if (loadSequence !== accountLoadSequence) return;
          const message = getErrorMessage(error);
          set((state) => ({
            isAccountLoading: false,
            accountLoadError: message,
            ...(state.authenticatedUserId
              ? {}
              : {
                  user: null,
                  isAuthenticated: false,
                  watchlist: [],
                  alerts: [],
                  positions: [],
                  portfolioHistory: [],
                  journals: [],
                  telegramChatId: null,
                }),
          }));
          reportSyncFailure('Data akun gagal dimuat', error);
        }
      },

      createAutoTrade: async (input) => {
        if (process.env.NEXT_PUBLIC_TRADING_ENABLED !== 'true') {
          throw new Error('Trading dinonaktifkan oleh konfigurasi deployment.');
        }

        const symbol = input.symbol.trim().toUpperCase();
        if (!TRADE_SYMBOL_PATTERN.test(symbol)) {
          throw new Error('Symbol trading harus berisi 2-32 karakter broker-safe.');
        }
        if (!MARKET_TYPES.includes(input.marketType)) {
          throw new Error('Market type tidak valid.');
        }
        if (input.action !== 'buy' && input.action !== 'sell') {
          throw new Error('Action trading tidak valid.');
        }
        if (!Number.isFinite(input.volume) || input.volume <= 0 || input.volume > 100) {
          throw new Error('Volume harus lebih dari 0 dan maksimal 100.');
        }
        if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
          throw new Error('Idempotency key trading tidak valid.');
        }

        const abortController = new AbortController();
        const timeoutId = globalThis.setTimeout(() => abortController.abort(), 15_000);
        let response: Response;

        try {
          response = await fetch('/api/trades', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol,
              marketType: input.marketType,
              action: input.action,
              volume: input.volume,
              idempotencyKey: input.idempotencyKey,
            }),
            signal: abortController.signal,
          });
        } catch (error) {
          if (abortController.signal.aborted) {
            throw new Error(
              'Permintaan antrean timeout. Status order belum diketahui; periksa antrean sebelum mencoba lagi.',
            );
          }
          throw error;
        } finally {
          globalThis.clearTimeout(timeoutId);
        }

        const body: unknown = await response.json().catch(() => null);
        const payload = asRow(body);

        if (!response.ok) {
          const errorDetails = asString(
            payload.error,
            asString(payload.message, `HTTP ${response.status}`),
          );
          throw new Error(errorDetails);
        }

        const trade = asRow(payload.trade);
        const id = asString(trade.id);
        if (!id) throw new Error('Server tidak mengembalikan ID trade.');

        return {
          id,
          status: asString(trade.status, 'pending'),
          duplicate: payload.duplicate === true,
        };
      },

      syncAlertToSupabase: async (alert) => {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          throwIfError(authError, 'Autentikasi gagal');
          if (!user) return;
          const userId = user.id;

          if ('deleted' in alert) {
            const { error } = await supabase
              .from('alerts')
              .delete()
              .eq('id', alert.id)
              .eq('user_id', userId);
            throwIfError(error, 'Alert gagal dihapus');
          } else {
            const data = {
              id: alert.id,
              user_id: userId,
              symbol: alert.symbol,
              market_type: alert.marketType,
              alert_type: alert.alertType,
              target_value: alert.targetValue,
              target_signal: alert.targetSignal,
              timeframe: alert.timeframe,
              is_active: alert.isActive,
              is_triggered: alert.isTriggered,
              triggered_at: alert.triggeredAt,
              trigger_count: alert.triggerCount,
              created_at: alert.createdAt
            };
            const { error } = await supabase.from('alerts').upsert(data);
            throwIfError(error, 'Alert gagal disinkronkan');
          }
        } catch (error) {
          reportSyncFailure('Sinkronisasi alert gagal', error);
        }
      },

      syncJournalToSupabase: async (journal) => {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          throwIfError(authError, 'Autentikasi gagal');
          if (!user) return;
          const userId = user.id;

          if ('deleted' in journal) {
            const { error } = await supabase
              .from('journals')
              .delete()
              .eq('id', journal.id)
              .eq('user_id', userId);
            throwIfError(error, 'Journal gagal dihapus');
          } else {
            const data = {
              id: journal.id,
              user_id: userId,
              title: journal.title,
              content: journal.content,
              symbol: journal.symbol || null,
              emotion: journal.emotion,
              created_at: journal.createdAt,
              updated_at: journal.updatedAt
            };
            const { error } = await supabase.from('journals').upsert(data);
            throwIfError(error, 'Journal gagal disinkronkan');
          }
        } catch (error) {
          reportSyncFailure('Sinkronisasi journal gagal', error);
        }
      },

      syncPortfolioToSupabase: async (position) => {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          throwIfError(authError, 'Autentikasi gagal');
          if (!user) return;
          const userId = user.id;

          if ('deleted' in position) {
            const { error } = await supabase
              .from('portfolios')
              .delete()
              .eq('id', position.id)
              .eq('user_id', userId);
            throwIfError(error, 'Posisi portfolio gagal dihapus');
          } else {
            const data = {
              id: position.id,
              user_id: userId,
              symbol: position.symbol,
              market_type: position.marketType,
              entry_price: position.entryPrice,
              amount: position.quantity,
              name: position.name,
              type: position.type,
              is_open: position.isOpen,
              closed_price: position.closedPrice ?? null,
              closed_at: position.closedAt ?? null,
              created_at: position.createdAt
            };
            const { error } = await supabase.from('portfolios').upsert(data);
            throwIfError(error, 'Posisi portfolio gagal disinkronkan');
          }
        } catch (error) {
          reportSyncFailure('Sinkronisasi portfolio gagal', error);
        }
      },

      syncWatchlistToSupabase: async (item) => {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          throwIfError(authError, 'Autentikasi gagal');
          if (!user) return;
          const userId = user.id;

          if ('deleted' in item) {
            const { error } = await supabase
              .from('watchlists')
              .delete()
              .eq('id', item.id)
              .eq('user_id', userId);
            throwIfError(error, 'Watchlist gagal dihapus');
          } else {
            const data = {
              id: item.id,
              user_id: userId,
              symbol: item.symbol,
              market_type: item.marketType,
              display_name: item.displayName,
              notes: item.notes,
              sort_order: item.sortOrder,
              timeframe: item.timeframe,
              last_signal: item.lastSignal,
              created_at: item.createdAt
            };
            const { error } = await supabase.from('watchlists').upsert(data);
            throwIfError(error, 'Watchlist gagal disinkronkan');
          }
        } catch (error) {
          reportSyncFailure('Sinkronisasi watchlist gagal', error);
        }
      },
      
      logout: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
          reportSyncFailure('Logout gagal', error);
          throw error;
        }

        accountLoadSequence += 1;
        set({
          user: null,
          authenticatedUserId: null,
          isAuthenticated: false,
          disclaimerAccepted: false,
          disclaimerAcceptedUserId: null,
          isAccountLoading: false,
          accountLoadError: null,
          watchlist: [],
          alerts: [],
          positions: [],
          portfolioHistory: [],
          journals: [],
          telegramChatId: null,
        });
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
