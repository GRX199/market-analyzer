import React, { useSyncExternalStore } from 'react';
import { create } from 'zustand';

const listeners = new Set();
const changed = () => listeners.forEach(listener => listener());
addEventListener('popstate', changed);
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const router = {
  push(href) { history.pushState(null, '', href); changed(); },
  replace(href) { history.replaceState(null, '', href); changed(); },
  refresh() { changed(); },
};
export function usePathname() { return useSyncExternalStore(subscribe, () => location.pathname); }
export function useRouter() { return router; }
export function useSearchParams() { return new URLSearchParams(location.search); }
export function useParams() { return { symbol: decodeURIComponent(location.pathname.split('/').at(-1)) }; }
export default function Link({ href, children, onClick, ...props }) {
  return <a href={href} {...props} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented && href?.startsWith('/') && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); router.push(href);
    }
  }}>{children}</a>;
}
export function redirect(href) { router.replace(href); }

// Isolated backend: the real store and UI run, but nothing reaches Supabase/MT5.
const fixtureUser = { id: 'fixture-owner', email: 'test@example.invalid' };
function query() {
  const result = { data: [], error: null };
  const chain = { then(resolve) { return Promise.resolve(result).then(resolve); } };
  for (const method of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle']) chain[method] = () => chain;
  return chain;
}
export const supabase = {
  from: query,
  auth: {
    getUser: async () => ({ data: { user: fixtureUser }, error: null }),
    signInWithPassword: async () => ({ data: null, error: new Error('invalid login credentials') }),
    signOut: async () => ({ error: null }),
  },
};
export const useRealtimeStore = create(() => ({ prices: {}, connectCrypto() {}, connectStocks() {}, startForexPolling() {}, subscribeSymbol() {}, unsubscribeSymbol() {}, disconnectAll() {} }));
const robot = { symbol: 'BTC/USDT', requestedVolume: .01, isAutoTradingEnabled: false, isRobotPaused: false,
  currentPrice: 62000, recentTrades: [], currentKline: null, klineHistory: [], isConnected: false,
  isBackfillComplete: false, reconnectAttempt: 0, reconnectExhausted: false, connectionError: null, feedSymbol: 'BTC/USDT',
  setRequestedVolume() {}, changeSymbol() {}, armRobot() { throw new Error('Robot activation forbidden in fixture'); }, stopRobot() {}, reconnect() {} };
export function useScalperRobotStatus() { return robot; }
export function useScalperRobot() { return robot; }
