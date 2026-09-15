import React from 'react';
import { createRoot } from 'react-dom/client';
import Page from '../../src/app/forex-news/page';

const iso = milliseconds => new Date(milliseconds).toISOString();
const started = Date.now();
const event = { id: 'forexfactory:fixture-cpi', provider: 'forexfactory', title: 'CPI y/y — TEST EVENT', currency: 'USD',
  scheduledAt: iso(started + 3600000), precise: true, importance: 3, actual: '', forecast: '3.0%', previous: '2.9%', revised: '',
  source: 'Fixture — not live', sourceUrl: 'https://www.forexfactory.com/calendar', updatedAt: null };
const feed = { events: [event, { ...event, id: 'fixture:2', currency: 'GBP', title: 'Unemployment Rate — TEST', importance: 2 }],
  provider: 'forexfactory', fetchedAt: iso(started), actualsSupported: false, note: 'TEST DATA. Kalender mingguan tanpa aktual.', serverTime: iso(started) };
window.fixture = { orders: JSON.parse(sessionStorage.getItem('fixture-orders') || '[]'), posts: [], failOnce: true };
window.fetch = async (url, options = {}) => {
  const fixture = window.fixture;
  if (url === '/api/forex-news') return Response.json(feed);
  if (url === '/api/forex-news/orders' && options.method === 'POST') {
    const body = JSON.parse(options.body); fixture.posts.push(body);
    let order = fixture.orders.find(item => item.id === body.id);
    if (!order) {
      order = { id: body.id, event, instrument: 'XAUUSDm', symbol: body.symbol, account_kind: body.accountKind,
        order_type: body.orderType, volume: body.volume, entry_price: body.entryPrice, stop_loss: body.stopLoss,
        take_profit: body.takeProfit, scheduled_at: iso(Date.parse(event.scheduledAt) + body.offsetSeconds * 1000),
        condition: body.condition, status: 'armed', reason: null };
      fixture.orders.push(order);
      sessionStorage.setItem('fixture-orders', JSON.stringify(fixture.orders));
    }
    if (fixture.failOnce) { fixture.failOnce = false; throw new TypeError('TEST response lost after save'); }
    return Response.json({ order });
  }
  if (url === '/api/forex-news/orders') return Response.json({ orders: fixture.orders });
  if (url.startsWith('/api/forex-news/orders?id=') && !options.method) {
    const id = new URL(url, location.origin).searchParams.get('id');
    return Response.json({ order: fixture.orders.find(item => item.id === id) ?? null });
  }
  if (url.startsWith('/api/forex-news/orders?id=') && options.method === 'DELETE') {
    const id = new URL(url, location.origin).searchParams.get('id');
    const order = fixture.orders.find(item => item.id === id); order.status = 'cancelled'; return Response.json({ order });
  }
  if (url.startsWith('/api/signals/advanced')) return Response.json({ data: [{ symbol: 'XAU/USD', source: { kind: 'broker', isProxy: false, accountKind: 'demo', validUntil: iso(started + 120000), instrument: 'XAUUSDm', bid: 2499, ask: 2500 },
    generatedAt: iso(started), expiresAt: iso(started + 120000), status: 'wait', plan: null,
    manualScenarios: [{ side: 'buy', entry: 2510, stopLoss: 2490, takeProfit: 2550 }] }] });
  throw new Error(`Unexpected fixture request: ${url}`);
};
createRoot(document.getElementById('root')).render(<Page />);
