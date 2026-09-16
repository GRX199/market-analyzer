# Workspace redesign — 16 September 2026

## What changed

- A shared navigation tree for desktop sidebar, mobile/tablet drawer, and search. The four mobile shortcuts are Beranda, Sinyal, Pasar, and Status MT5. The old retired calendar route remains available by URL but is not promoted as a working calendar; the economic news/order page remains in the menu.
- A quieter light/dark palette, system fonts, solid cards, consistent spacing and headings. No new image downloads, font requests, runtime libraries or animation dependencies.
- Dashboard prioritizes signals and MT5 status. Signals keeps Entry/SL/TP and order validation visible while filters, source help and detailed indicators can be expanded. Nothing changes the strategy, risk checks, worker permissions, or order API.
- Mobile navigation below 1024px; a 240px/collapsible desktop sidebar from 1024px. Cards and filters reflow, tabs wrap, tables have keyboard-scrollable regions, and long dialogs scroll within the viewport. Order price fields use one column on small screens.
- Minimum 44px control targets, keyboard focus, skip-to-content, clearer control labels and alert form associations. Watchlist buttons no longer sit inside a clickable asset link.
- Market, asset detail and comparison charts show actionable load failures and retries. Cancelled requests cannot overwrite a new instrument/filter response. Comparison charts have independent readable heights on mobile.

## Verification

Latest run: 191/191 automated tests passed; TypeScript and production build passed. ESLint passed (a hook-alias warning was corrected and the affected file rechecked). All 168 responsive checks, 16 dark views, four expanded-filter views and 12 palette pairs passed. Signals and Forex news browser suites also passed. Screenshots were visually reviewed at the required mobile, tablet and desktop widths.

Run `npm run check` for ESLint, TypeScript, 191 automated tests, and production build.

Browser suites (use a locally installed Playwright or set `PLAYWRIGHT_TEST_MODULE` to its `index.mjs`; these tests launch headless Edge):

```powershell
node tests/workspace-browser.test.mjs
node tests/signals-browser.test.mjs
node tests/forex-news-browser.test.mjs
```

Workspace suite covers 21 pages at **360, 390, 640, 768, 900, 1024, 1280 and 1440px**: 168 page/width checks for document overflow, visible button/tab/combobox target sizes and browser runtime errors. It also checks 16 dark-mode views, expanded Signals filters at four widths, keyboard navigation, drawer dismissal, search, watchlist interaction, retry states, theme switching, alert dialog labels and failed-login feedback. Twelve core text/background palette pairs must meet at least 4.5:1 contrast; this is not a claim of a complete WCAG audit.

Signals suite checks order dialogs at 360/768/1024/1440px, Entry/SL/TP, optional TP2, confirmation reset, lost-response retry identity, failed order receipts and stale-signal guards. Forex news suite covers existing news-order gating and cancellation.

Reports and screenshots are generated under `local-reports/workspace-ui/`, `local-reports/signals-ui/`, and `.next/forex-news-ui/`; these are not committed. Synthetic data is used, external requests are blocked and no real order is placed. Some secondary pages are checked in empty/error states, not with every possible account dataset. Tests do not verify live MT5 connectivity, provider availability, broker execution, or trading profitability.

No database migration or environment-variable change is required for this redesign.
